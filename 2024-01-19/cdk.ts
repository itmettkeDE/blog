#!/usr/bin/env node

import "source-map-support/register";
import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";

function createProvider(scope: Construct) {
  return new iam.OpenIdConnectProvider(scope, "GithubProvider", {
    url: "https://token.actions.githubusercontent.com",
    clientIds: ["sts.amazonaws.com"],
    // These thumbprints are the intermediate certificates from github.
    // More infos here: https://github.blog/changelog/2023-06-27-github-actions-update-on-oidc-integration-with-aws
    thumbprints: [
      "6938fd4d98bab03faadb97b34396831e3780aea1",
      "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
    ],
  });
}

export interface CreateRoleProps {
  allowAccessFromPr?: boolean;
  branches: string[];
  repoFullSlug: string;
  roleName: string;
}

function createRole(
  scope: Construct,
  provider: iam.IOpenIdConnectProvider,
  props: CreateRoleProps,
) {
  return new iam.Role(scope, "GithubRole", {
    assumedBy: new iam.FederatedPrincipal(
      provider.openIdConnectProviderArn,
      {
        "ForAllValues:StringLike": {
          "token.actions.githubusercontent.com:sub": [
            props.branches.map(
              (branch) => `repo:${props.repoFullSlug}:ref:refs/heads/${branch}`,
            ),
            props.allowAccessFromPr
              ? [`repo:${props.repoFullSlug}:pull_request`]
              : [],
          ].flat(),
        },
      },
      "sts:AssumeRoleWithWebIdentity",
    ),
    managedPolicies: [
      iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess"),
    ],
    roleName: props.roleName,
  });
}

interface GithubStackProps extends cdk.StackProps, CreateRoleProps {}

class GithubStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    readonly props: GithubStackProps,
  ) {
    super(scope, id, props);

    const provider = createProvider(this);
    createRole(this, provider, props);
  }
}

const app = new cdk.App();
new GithubStack(app, "github", {
  branches: ["main"],
  repoFullSlug: "<name/project>",
  roleName: "openid-github-deploy",
});
