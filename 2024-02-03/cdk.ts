#!/usr/bin/env node

import "source-map-support/register";
import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as ssm from "aws-cdk-lib/aws-ssm";

class TestStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    new ssm.StringParameter(this, "TestParam", {
      parameterName: "TestParam",
      stringValue: "Test",
    });
  }
}

interface StageRef {}

enum StageType {
  Prod,
  Dev,
  Branch,
}

const app = new cdk.App();

const prodStage = new cdk.Stage(app, "Prod");
createStacks(prodStage, StageType.Prod);

const devStage = new cdk.Stage(app, "Dev");
const devStageRef = createStacks(devStage, StageType.Dev);

if (
  process.env.BRANCH_NAME &&
  process.env.BRANCH_NAME != "Prod" &&
  process.env.BRANCH_NAME != "Dev"
) {
  const branchName = process.env.BRANCH_NAME.replace(
    new RegExp("[^a-zA-Z0-9-]", "g"),
    "-",
  ).replace(new RegExp("^[^a-zA-Z]*"), "");
  if (branchName.length > 1) {
    const branchStage = new cdk.Stage(app, branchName);
    createStacks(branchStage, StageType.Branch, devStageRef);
  }
}

function createStacks(
  stage: cdk.Stage,
  stageType: StageType,
  devStageRef?: StageRef,
): StageRef {
  new TestStack(stage, "TestStack");
  if (stageType == StageType.Prod) {
    new TestStack(stage, "ProdOnlyTestStack");
  }
  return {};
}
