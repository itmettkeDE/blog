import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as StackSet from "./stack";

export interface UnmanagedStackSetStackProps extends cdk.StackProps {
  removalPolicy: cdk.RemovalPolicy;
  stackInstancesGroup: StackSet.StackInstancesProperty[];

  administrationRole?: iam.IRole | StackSet.CreateRole;
  capabilities?: StackSet.Capability[];
  description?: string;
  executionRole?: iam.IRole | StackSet.CreateRole;
  managedExecution?: StackSet.ManagedExecution;
  operationPreferences?: StackSet.OperationPreferencesProperty;
  parameters?: {
    [key: string]: string;
  };
  stackSetName: string;
  tags?: {
    [key: string]: string;
  };
}

export class UnmanagedStackSetStack extends StackSet.StackSetStack {
  constructor(
    scope: Construct,
    id: string,
    props: UnmanagedStackSetStackProps,
  ) {
    super(scope, id, {
      ...props,
      permissionModel: StackSet.PermissionModel.SELF_MANAGED,
    });
  }
}
