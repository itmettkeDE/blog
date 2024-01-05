import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { Capability, RegionConcurrencyType, CreateRole } from "./stack";
import {
  UnmanagedStackSetStack,
  UnmanagedStackSetStackProps,
} from "./unmanagedstack";

import * as fs from "fs";
import * as path from "path";

export interface BootstrapStackProps extends cdk.StackProps {
  // Allow access from account ids outside the AWS Org
  externalAccountIds?: string[];
  // Allow access from an AWS Org
  orgId?: string;
  regions: Set<string>;
  removalPolicy: cdk.RemovalPolicy;
}

export interface BootstrapBucket {
  bucketPrefix: string;
  bucketName: string;
  region: string;
}

export class BootstrapStack extends cdk.Stack {
  public readonly bootstrapBuckets: {
    [region: string]: BootstrapBucket;
  };
  public readonly publishRole: iam.IRole;

  constructor(
    scope: Construct,
    id: string,
    readonly props: BootstrapStackProps,
  ) {
    super(scope, id, props);

    const assetBucketWildcard = `${id}-AssetBucket`.toLowerCase();
    this.bootstrapBuckets = Object.fromEntries(
      Array.from(props.regions).map((region) => [
        region,
        {
          bucketPrefix: assetBucketWildcard,
          bucketName: `${assetBucketWildcard}-${region}`,
          region,
        },
      ]),
    );
    this.publishRole = this.createAssetPublishRole(id);
    this.createStackSet(id, props, assetBucketWildcard);
  }

  private createAssetPublishRole(id: string) {
    // This role allows cdk to publish assets to the asset buckets
    const assetPublishRoleName = `${id}-AssetPublishRole`;
    const assetPublishRole = new iam.Role(this, "AssetPublishRole", {
      roleName: assetPublishRoleName,
      assumedBy: new iam.AccountRootPrincipal(),
    });
    assetPublishRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          "s3:GetObject*",
          "s3:GetBucket*",
          "s3:GetEncryptionConfiguration",
          "s3:List*",
          "s3:DeleteObject*",
          "s3:PutObject*",
          "s3:Abort*",
        ],
        resources: Object.entries(this.bootstrapBuckets)
          .map(([region, bucket]) => [
            `arn:aws:s3:::${bucket.bucketName}`,
            `arn:aws:s3:::${bucket.bucketName}/*`,
          ])
          .flat(),
      }),
    );
    return assetPublishRole;
  }

  createStackSet(
    id: string,
    props: BootstrapStackProps,
    assetBucketWildcard: string,
  ) {
    new BootstrapStackSet(this, "BootstrapStackSet", {
      ...props,
      administrationRole: new CreateRole(),
      assetBucketWildcard,
      capabilities:
        props.removalPolicy == cdk.RemovalPolicy.DESTROY
          ? [Capability.NAMED_IAM]
          : [],
      executionRole: new CreateRole(),
      operationPreferences: {
        regionConcurrencyType: RegionConcurrencyType.PARALLEL,
      },
      stackInstancesGroup: [
        {
          deploymentTargets: {
            accounts: [this.account],
          },
          regions: Array.from(props.regions),
        },
      ],
      stackSetName: `${id}-BootstrapStackSet`,
    });
  }
}

export interface BootstrapStackSetProps extends UnmanagedStackSetStackProps {
  assetBucketWildcard: string;
  externalAccountIds?: string[];
  orgId?: string;
}

export class BootstrapStackSet extends UnmanagedStackSetStack {
  constructor(scope: Construct, id: string, props: BootstrapStackSetProps) {
    super(scope, id, props);

    const bucket = this.createAssetBucket(props);
    this.createBucketDeletionLambda(props, bucket);
  }

  private createAssetBucket(props: BootstrapStackSetProps) {
    const scopedAws = new cdk.ScopedAws(this);
    const bucketName = `${props.assetBucketWildcard}-${scopedAws.region}`;
    const assetBucket = new s3.Bucket(this, "AssetBucket", {
      bucketName,
      blockPublicAccess: {
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: true,
        // Allows cross account access
        restrictPublicBuckets: false,
      },
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: props.removalPolicy,
    });
    if (props.orgId != undefined) {
      assetBucket.addToResourcePolicy(
        new iam.PolicyStatement({
          resources: [assetBucket.arnForObjects("*")],
          actions: ["s3:GetObject"],
          principals: [new iam.AnyPrincipal()],
          conditions: {
            StringEquals: {
              "aws:PrincipalOrgID": [props.orgId],
            },
          },
        }),
      );
    }
    if (props.externalAccountIds != undefined) {
      assetBucket.addToResourcePolicy(
        new iam.PolicyStatement({
          resources: [assetBucket.arnForObjects("*")],
          actions: ["s3:GetObject"],
          principals: [new iam.AnyPrincipal()],
          conditions: {
            StringEquals: {
              "aws:PrincipalAccount": props.externalAccountIds,
            },
          },
        }),
      );
    }
    return assetBucket;
  }

  createBucketDeletionLambda(
    props: BootstrapStackSetProps,
    bucket: s3.IBucket,
  ) {
    if (props.removalPolicy == cdk.RemovalPolicy.DESTROY) {
      const code = lambda.Code.fromInline(
        fs.readFileSync(path.join(__dirname, "delete-objects.js"), "utf8"),
      );
      const func = new lambda.Function(this, "EmptyBootstrapFunc", {
        // May be set to ARM but not every region supports it
        architecture: lambda.Architecture.X86_64,
        code,
        handler: "index.handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.minutes(15),
        environment: {
          BUCKET: bucket.bucketName,
        },
      });
      bucket.grantReadWrite(func.role!);

      const log = new logs.LogGroup(this, "FunctionLogGroup", {
        logGroupName: `/aws/lambda/${func.functionName}`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: props.removalPolicy,
      });
      const resource = new cdk.CustomResource(this, "EmptyBootstrapResource", {
        serviceToken: func.functionArn,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        resourceType: "Custom::DeleteBucket",
      });
      resource.node.addDependency(log);
      resource.node.addDependency(bucket);
      resource.node.addDependency(func);
    }
  }
}
