import { Construct } from "constructs";
import { StackSetSynthesizer } from "./synthesizer";
import * as cdk from "aws-cdk-lib";
import * as cloudformation from "aws-cdk-lib/aws-cloudformation";
import * as crypto from "crypto";
import * as cxapi from "aws-cdk-lib/cx-api";
import * as iam from "aws-cdk-lib/aws-iam";

export class CreateRole {}

export class PermissionModel {
  static SELF_MANAGED = new this("SELF_MANAGED");
  static SERVICE_MANAGED = new this("SERVICE_MANAGED");

  private constructor(readonly model: string) {}
}

export interface AutoDeploymentProperty {
  readonly enabled: boolean;
  readonly retainStacksOnAccountRemoval: boolean;
}

export class CallAs {
  static DELEGATED_ADMIN = new this("DELEGATED_ADMIN");
  static SELF = new this("SELF");

  private constructor(readonly callAs: string) {}
}

export class Capability {
  static NAMED_IAM = new this("NAMED_IAM");

  private readonly cap: string;

  private constructor(cap: string) {
    this.cap = cap;
  }

  toString() {
    return `CAPABILITY_${this.cap}`;
  }
}

export interface ManagedExecution {
  active: boolean;
}

export interface OperationPreferencesProperty {
  failureToleranceCount?: number;
  failureTolerancePercentage?: number;
  maxConcurrentCount?: number;
  maxConcurrentPercentage?: number;
  regionConcurrencyType?: RegionConcurrencyType;
  regionOrder?: string[];
}

export class RegionConcurrencyType {
  static SEQUENTIAL = new this("SEQUENTIAL");
  static PARALLEL = new this("PARALLEL");

  private constructor(readonly type: string) {}
}

export interface StackInstancesProperty {
  deploymentTargets: DeploymentTargetsProperty;
  parameterOverrides?: {
    [key: string]: string;
  };
  regions: string[];
}

export interface DeploymentTargetsProperty {
  accountFilterType?: AccountFilterType;
  accounts?: string[];
  organizationalUnitIds?: string[];
}

export class AccountFilterType {
  static INTERSECTION = new this("INTERSECTION");
  static DIFFERENCE = new this("DIFFERENCE");
  static UNION = new this("UNION");
  static NONE = new this("NONE");

  private constructor(readonly type: string) {}
}

export interface StackSetStackProps extends cdk.StackProps {
  permissionModel: PermissionModel;
  removalPolicy: cdk.RemovalPolicy;
  stackInstancesGroup: StackInstancesProperty[];

  administrationRole?: iam.IRole | CreateRole;
  autoDeployment?: AutoDeploymentProperty;
  callAs?: CallAs;
  capabilities?: Capability[];
  description?: string;
  executionRole?: iam.IRole | CreateRole | string;
  managedExecution?: ManagedExecution;
  operationPreferences?: OperationPreferencesProperty;
  stackSetName: string;
  tags?: {
    [key: string]: string;
  };
}

export class StackSetStack extends cdk.Stack {
  public readonly templateFile: string;
  public readonly nestedStackResource?: cdk.CfnResource;

  private readonly parameters: { [name: string]: string };
  private readonly resource: cloudformation.CfnStackSet;
  private readonly _contextualStackId: string;
  private readonly _contextualStackName: string;
  private _templateUrl?: string;
  private _parentStack: cdk.Stack;

  constructor(
    scope: Construct,
    id: string,
    readonly props: StackSetStackProps,
  ) {
    const parentStack = cdk.Stack.of(scope);

    super(scope, id, {
      description: props.description,
      crossRegionReferences: parentStack._crossRegionReferences,
      env: {
        region: cdk.Aws.REGION,
      },
      synthesizer: new StackSetSynthesizer({
        parentDeployment: parentStack.synthesizer,
        regions: new Set<string>(
          props.stackInstancesGroup.map((group) => group.regions).flat(),
        ),
      }),
      tags: {
        ...parentStack.tags.tagValues(),
        ...props.tags,
      },
    });
    this._parentStack = parentStack;

    const parentScope = new Construct(scope, id + ".StackSet");

    // this is the file name of the synthesized template file within the cloud assembly
    this.templateFile = `${id}.stackset.template.json`;
    this.parameters = {};

    const adminRole = this.getOrCreateAdminRole(parentScope, props);
    const execRole = this.getOrCreateExecutionRole(
      parentScope,
      props,
      adminRole,
    );
    const execRoleName =
      typeof execRole === "string" ? execRole : execRole?.roleName;
    this.resource = new cloudformation.CfnStackSet(parentScope, id, {
      permissionModel: props.permissionModel.model,
      stackSetName: props.stackSetName,

      administrationRoleArn: adminRole?.roleArn,
      autoDeployment: props.autoDeployment,
      callAs: props.callAs?.callAs,
      capabilities: props.capabilities?.map((cap) => cap.toString()),
      description: props.description,
      executionRoleName: execRoleName,
      managedExecution:
        props.managedExecution == undefined
          ? undefined
          : {
              Active: props.managedExecution.active,
            },
      operationPreferences: {
        ...props.operationPreferences,
        regionConcurrencyType:
          props.operationPreferences?.regionConcurrencyType?.type,
      },
      parameters: cdk.Lazy.uncachedAny({
        produce: () =>
          Object.entries(this.parameters).map(([key, value]) => ({
            parameterKey: key,
            parameterValue: value,
          })),
      }),
      stackInstancesGroup: props.stackInstancesGroup.map((group) =>
        this.convertStackInstanceGroup(group),
      ),
      tags: Object.entries({
        ...this.tags.tagValues(),
        ...props.tags,
      }).map(([key, value]) => ({
        key,
        value,
      })),
      templateUrl: cdk.Lazy.uncachedString({
        produce: () => this._templateUrl || "<unresolved>",
      }),
    });
    this.resource.applyRemovalPolicy(props.removalPolicy);
    if (adminRole != undefined) {
      this.resource.node.addDependency(adminRole);
    }
    if (execRole != undefined && typeof execRole != "string") {
      this.resource.node.addDependency(execRole);
    }

    this.nestedStackResource = this.resource;
    this.node.defaultChild = this.resource;

    // context-aware stack name: if resolved from within this stack, return AWS::StackName
    // if resolved from the outer stack, use the { Ref } of the AWS::CloudFormation::Stack resource
    // which resolves the ARN of the stack. We need to extract the stack name, which is the second
    // component after splitting by "/"
    this._contextualStackName = this.contextualAttribute(
      cdk.Aws.STACK_NAME,
      cdk.Fn.select(1, cdk.Fn.split("/", this.resource.ref)),
    );
    this._contextualStackId = this.contextualAttribute(
      cdk.Aws.STACK_ID,
      this.resource.ref,
    );
  }

  public addParameter(
    name: string,
    value: string,
    props?: cdk.CfnParameterProps,
  ): cdk.CfnParameter {
    this.parameters[name] = value;
    return new cdk.CfnParameter(this, name, props);
  }

  public setParameter(name: string, value: string) {
    this.parameters[name] = value;
  }

  private getOrCreateAdminRole(
    scope: Construct,
    props: StackSetStackProps,
  ): iam.IRole | undefined {
    if (props.administrationRole instanceof CreateRole) {
      return iam.Role.fromRoleName(
        scope,
        "CdkExecRole",
        `cdk-hnb659fds-cfn-exec-role-${cdk.Stack.of(scope).account}-${
          cdk.Stack.of(scope).region
        }`,
      );
    } else {
      return props.administrationRole;
    }
  }

  private getOrCreateExecutionRole(
    scope: Construct,
    props: StackSetStackProps,
    adminRole?: iam.IRole,
  ): iam.IRole | string | undefined {
    if (adminRole == undefined) {
      return undefined;
    }
    if (props.executionRole instanceof CreateRole) {
      return new iam.Role(scope, "StackSetExecRole", {
        roleName: props.stackName
          ? `${props.stackName}-StackSetExecRole`
          : undefined,
        assumedBy: adminRole,
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess"),
        ],
      });
    } else {
      return props.executionRole;
    }
  }

  private convertStackInstanceGroup(
    group: StackInstancesProperty,
  ): cloudformation.CfnStackSet.StackInstancesProperty {
    return {
      deploymentTargets: {
        accountFilterType: group.deploymentTargets.accountFilterType?.type,
        accounts: group.deploymentTargets.accounts,
        organizationalUnitIds: group.deploymentTargets.organizationalUnitIds,
      },
      parameterOverrides: Object.entries({ ...group.parameterOverrides }).map(
        ([key, value]) => ({
          parameterKey: key,
          parameterValue: value,
        }),
      ),
      regions: group.regions,
    };
  }

  /**
   * Defines an asset at the parent stack which represents the template of this
   * nested stack.
   *
   * This private API is used by `App.prepare()` within a loop that rectifies
   * references every time an asset is added. This is because (at the moment)
   * assets are addressed using CloudFormation parameters.
   *
   * @returns `true` if a new asset was added or `false` if an asset was
   * previously added. When this returns `true`, App will do another reference
   * rectification cycle.
   *
   * @internal
   */
  public _prepareTemplateAsset() {
    if (this._templateUrl) {
      return false;
    }

    // When adding tags to nested stack, the tags need to be added to all the resources in
    // in nested stack, which is handled by the `tags` property, But to tag the
    //  tags have to be added in the parent stack CfnStack resource. The CfnStack resource created
    // by this class dont share the same TagManager as that of the one exposed by the `tag` property of the
    //  class, all the tags need to be copied to the CfnStack resource before synthesizing the resource.
    // See https://github.com/aws/aws-cdk/pull/19128
    Object.entries(this.tags.tagValues()).forEach(([key, value]) => {
      this.resource.tags.setTag(key, value);
    });

    const cfn = JSON.stringify(this._toCloudFormation());
    const templateHash = crypto.createHash("sha256").update(cfn).digest("hex");

    const templateLocation = this._parentStack.synthesizer.addFileAsset({
      packaging: cdk.FileAssetPackaging.FILE,
      sourceHash: templateHash,
      fileName: this.templateFile,
    });

    this.addResourceMetadata(this.resource, "TemplateURL");

    // if bucketName/objectKey are cfn parameters from a stack other than the parent stack, they will
    // be resolved as cross-stack references like any other (see "multi" tests).
    this._templateUrl = `https://s3.${this._parentStack.region}.${this._parentStack.urlSuffix}/${templateLocation.bucketName}/${templateLocation.objectKey}`;
    return true;
  }

  private contextualAttribute(innerValue: string, outerValue: string) {
    return cdk.Token.asString({
      resolve: (context: cdk.IResolveContext) => {
        if (cdk.Stack.of(context.scope) === this) {
          return innerValue;
        } else {
          return outerValue;
        }
      },
    });
  }

  private addResourceMetadata(
    resource: cdk.CfnResource,
    resourceProperty: string,
  ) {
    if (
      !this.node.tryGetContext(cxapi.ASSET_RESOURCE_METADATA_ENABLED_CONTEXT)
    ) {
      return; // not enabled
    }

    // tell tools such as SAM CLI that the "TemplateURL" property of this resource
    // points to the nested stack template for local emulation
    resource.cfnOptions.metadata = resource.cfnOptions.metadata || {};
    resource.cfnOptions.metadata[cxapi.ASSET_RESOURCE_METADATA_PATH_KEY] =
      this.templateFile;
    resource.cfnOptions.metadata[cxapi.ASSET_RESOURCE_METADATA_PROPERTY_KEY] =
      resourceProperty;
  }
}
