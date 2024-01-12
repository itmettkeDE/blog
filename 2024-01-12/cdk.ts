#!/usr/bin/env node

import "source-map-support/register";
import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as custom_resources from "aws-cdk-lib/custom-resources";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";

class OrganizationSsoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    const ssoInstanceArn = this.getSsoInstanceArn();
    const permissionSetArn = this.createRestrictedRole(ssoInstanceArn);
    this.assignToAccount(ssoInstanceArn, permissionSetArn);
  }

  getSsoInstanceArn(): string {
    const resource = new custom_resources.AwsCustomResource(
      this,
      "SsoInstance",
      {
        logRetention: logs.RetentionDays.ONE_MONTH,
        onCreate: {
          action: "listInstances",
          service: "SSOAdmin",
          parameters: {},
          physicalResourceId:
            custom_resources.PhysicalResourceId.of("SsoInstance"),
        },
        policy: custom_resources.AwsCustomResourcePolicy.fromStatements([
          new iam.PolicyStatement({
            actions: ["sso:ListInstances"],
            resources: ["*"],
          }),
        ]),
        resourceType: "Custom::SsoInstance",
        timeout: cdk.Duration.minutes(5),
      },
    );
    return resource.getResponseField("Instances.0.InstanceArn");
  }

  createRestrictedRole(ssoInstanceArn: string) {
    const permissionSet = new cdk.aws_sso.CfnPermissionSet(
      this,
      "RestrictedAccess",
      {
        instanceArn: ssoInstanceArn,
        name: "RestrictedAccess",

        description:
          "Provides mostly read only access to user for day to day access",
        inlinePolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              resources: ["*"],
              actions: [
                // Additional Actions to allow like Lambda Invoke
              ],
            }),
          ],
        }).toJSON(),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName("ReadOnlyAccess"),
        ].map((policy) => policy.managedPolicyArn),
        sessionDuration: `PT${cdk.Duration.hours(8).toHours()}H`,
        tags: Object.entries(cdk.Stack.of(this).tags.tagValues()).map(
          ([key, value]) => ({
            key,
            value,
          }),
        ),
      },
    );
    permissionSet.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
    return permissionSet.attrPermissionSetArn;
  }

  assignToAccount(ssoInstanceArn: string, permissionSetArn: string) {
    const assignment = new cdk.aws_sso.CfnAssignment(this, "SsoAssignment", {
      instanceArn: ssoInstanceArn,
      permissionSetArn: permissionSetArn,
      principalId: "<USER|GROUP ID>",
      principalType: "<USER|GROUP>",
      targetId: "<ACCOUNT ID>",
      targetType: "AWS_ACCOUNT",
    });
    assignment.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
  }
}

const app = new cdk.App();
new OrganizationSsoStack(app, "org-sso", {});
