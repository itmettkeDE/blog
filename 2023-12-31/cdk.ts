#!/usr/bin/env node

import "source-map-support/register";
import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as stacksets from "./stacksets";

export class TestStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props: cdk.StackProps,
  ) {
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
          regions: [this.region],
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
          regions: [this.region],
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

    new ssm.StringParameter(this, "TestParam", {
      parameterName: "TestStackSetUnmanaged",
      stringValue: "Test",
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

    new ssm.StringParameter(this, "TestParam", {
      parameterName: "TestStackSetManaged",
      stringValue: "Test",
    });
  }
}

const app = new cdk.App();
new TestStack(app, "TestStack", {});
