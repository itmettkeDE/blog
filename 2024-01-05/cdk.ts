#!/usr/bin/env node

import "source-map-support/register";
import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as path from "path";
import * as s3Assets from "aws-cdk-lib/aws-s3-assets";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as stacksets from "./stacksets";

export interface TestStackProps extends cdk.StackProps {
  regions: Set<string>;
}

export class TestStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: TestStackProps) {
    super(scope, id, props);

    new TestStackSetUnmanaged(this, "TestStackSetUnmanaged", {
      ...props,
      administrationRole: new stacksets.CreateRole(),
      executionRole: new stacksets.CreateRole(),
      operationPreferences: {
        regionConcurrencyType: stacksets.RegionConcurrencyType.PARALLEL,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      stackInstancesGroup: [
        {
          deploymentTargets: {
            accounts: [this.account],
          },
          regions: Array.from(props.regions),
        },
      ],
      stackSetName: `${id}StackSetUnmanaged`,
    });

    new TestStackSetManaged(this, "TestStackSetManaged", {
      ...props,
      autoDeployment: {
        enabled: true,
        retainStacksOnAccountRemoval: false,
      },
      callAs: stacksets.CallAs.SELF,
      operationPreferences: {
        regionConcurrencyType: stacksets.RegionConcurrencyType.PARALLEL,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      stackInstancesGroup: [
        {
          deploymentTargets: {
            organizationalUnitIds: ["<OU Id>"],
          },
          regions: Array.from(props.regions),
        },
      ],
      stackSetName: `${id}StackSetManaged`,
    });
  }
}

export class TestStackSetUnmanaged extends stacksets.UnmanagedStackSetStack {
  constructor(
    scope: Construct,
    id: string,
    props: stacksets.UnmanagedStackSetStackProps,
  ) {
    super(scope, id, props);

    const asset = new s3Assets.Asset(this, "SampleAsset", {
      path: path.join(__dirname, "test-asset.txt"),
    });
    new ssm.StringParameter(this, "TestParam", {
      parameterName: "TestStackSetManaged",
      stringValue: asset.s3ObjectUrl,
    });
  }
}

export class TestStackSetManaged extends stacksets.ManagedStackSetStack {
  constructor(
    scope: Construct,
    id: string,
    props: stacksets.ManagedStackSetStackProps,
  ) {
    super(scope, id, props);

    const asset = new s3Assets.Asset(this, "SampleAsset", {
      path: path.join(__dirname, "test-asset.txt"),
    });
    new ssm.StringParameter(this, "TestParam", {
      parameterName: "TestStackSetManaged",
      stringValue: asset.s3ObjectUrl,
    });
  }
}

const app = new cdk.App();
const bootstrap = new stacksets.BootstrapStack(app, "BootstrapStack", {
  regions: new Set(["eu-central-1", "eu-west-1"]),
  removalPolicy: cdk.RemovalPolicy.DESTROY,
});

const test = new TestStack(app, "TestStack", {
  regions: new Set(["eu-central-1", "eu-west-1"]),
  synthesizer: new stacksets.StackSetParentSynthesizer({
    bootstrap,
  }),
});
test.addDependency(bootstrap);
