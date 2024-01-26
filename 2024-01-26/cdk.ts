#!/usr/bin/env node

import "source-map-support/register";
import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as custom_resources from "aws-cdk-lib/custom-resources";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as stacksets from "../2023-12-31/stacksets";

class OrganizationSsoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    const ssoInstanceArn = this.getSsoInstanceArn();

    // This Permission Set is for the Product Champion. Its connected to all Account
    // Stages like dev, test and prod and the product champion will be the on to get
    // access.
    const permissionSetArn =
      this.createEmergencyAccessRoleForTeams(ssoInstanceArn);
    this.assignToAccount(
      ssoInstanceArn,
      permissionSetArn,
      "EmergencyAccessRoleForTeams",
    );

    // This Permission Set is for the Cloud Engineering Team. It allows write access
    // to any Account to perform changes in emergencies. Its connected only to the
    // Emergency Account and the cloud engineers who are allowed to use it.
    const permissionSetArnGlobal =
      this.createEmergencyAccessRoleForGlobalAccess(ssoInstanceArn);
    this.assignToAccount(
      ssoInstanceArn,
      permissionSetArnGlobal,
      "EmergencyAccessRoleForGlobalAccess",
    );
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

  createEmergencyAccessRoleForTeams(ssoInstanceArn: string) {
    const permissionSet = new cdk.aws_sso.CfnPermissionSet(
      this,
      "EmergencyAccessForTeams",
      {
        instanceArn: ssoInstanceArn,
        name: "EmergencyAccessForTeams",

        description:
          "Provides Write permissions for specific users to allow performing changes in energencies",
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess"),
        ].map((policy) => policy.managedPolicyArn),
        sessionDuration: `PT${cdk.Duration.hours(1).toHours()}H`,
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

  createEmergencyAccessRoleForGlobalAccess(ssoInstanceArn: string) {
    const permissionSet = new cdk.aws_sso.CfnPermissionSet(
      this,
      "OrgEmergencyAccess",
      {
        instanceArn: ssoInstanceArn,
        name: "OrgEmergencyAccess",

        description:
          "Allows to assume an Emergency Access Role in any Account of the Organization",
        inlinePolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              resources: [`arn:aws:iam::*:role/OrgEmergencyAccess`],
              actions: ["sts:AssumeRole"],
            }),
          ],
        }),
        sessionDuration: `PT${cdk.Duration.hours(1).toHours()}H`,
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

  assignToAccount(
    ssoInstanceArn: string,
    permissionSetArn: string,
    id: string,
  ) {
    const assignment = new cdk.aws_sso.CfnAssignment(
      this,
      `SsoAssignment-${id}`,
      {
        instanceArn: ssoInstanceArn,
        permissionSetArn: permissionSetArn,
        principalId: "<USER|GROUP ID>",
        principalType: "<USER|GROUP>",
        targetId: "<ACCOUNT ID>",
        targetType: "AWS_ACCOUNT",
      },
    );
    assignment.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
  }
}

interface OrganizationAccountsStackProps extends cdk.StackProps {
  emergencyAccountId: string;
}

class OrganizationAccountsStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props: OrganizationAccountsStackProps,
  ) {
    super(scope, id, props);

    new OrganizationAccountsStackSet(this, "TestStackSetManaged", {
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
          regions: [this.region],
        },
      ],
      stackSetName: `${id}StackSetManaged`,
    });
  }
}

interface OrganizationAccountsStackSetProps
  extends stacksets.ManagedStackSetStackProps {
  emergencyAccountId: string;
}

export class OrganizationAccountsStackSet extends stacksets.ManagedStackSetStack {
  constructor(
    scope: Construct,
    id: string,
    props: OrganizationAccountsStackSetProps,
  ) {
    super(scope, id, props);

    const role = new iam.Role(scope, "EmergencyRole", {
      assumedBy: new iam.AccountPrincipal(
        props.emergencyAccountId,
      ).withConditions({
        ArnLike: {
          "aws:PrincipalArn": [
            `arn:aws:iam::${props.emergencyAccountId}:role/aws-reserved/sso.amazonaws.com/*/AWSReservedSSO_OrgEmergencyAccess_*`,
          ],
        },
      }),
      roleName: "OrgEmergencyAccess",
    });
    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess"),
    );
  }
}

const app = new cdk.App();
new OrganizationSsoStack(app, "org-sso", {});
new OrganizationAccountsStack(app, "org-accounts", {
  emergencyAccountId: "<Emergency Account ID>",
});
