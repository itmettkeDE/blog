import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as StackSet from "./stack";

export interface ManagedStackSetStackProps extends cdk.StackProps {
  removalPolicy: cdk.RemovalPolicy;
  stackInstancesGroup: StackSet.StackInstancesProperty[];

  autoDeployment?: StackSet.AutoDeploymentProperty;
  callAs?: StackSet.CallAs;
  capabilities?: StackSet.Capability[];
  description?: string;
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

export class ManagedStackSetStack extends StackSet.StackSetStack {
  constructor(scope: Construct, id: string, props: ManagedStackSetStackProps) {
    super(scope, id, {
      ...props,
      permissionModel: StackSet.PermissionModel.SERVICE_MANAGED,
    });
  }
}
