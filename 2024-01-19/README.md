# CI Infrastructure Deployment with AWS

Reacting to problems and new situation by quickly changing Infrastructure on the AWS Management Console is very problematic in the long run. Yes it does solve the problem now, but very often it leads to problems down the road when changes do not match the expected Infrastructure defined in the Source Code.

In [Part 1](https://www.linkedin.com/pulse/aws-organization-read-only-access-marc-mettke-5gaae/) we took away this situation by granting only Read Only Permissions to most of the users. To make sure that we can still move fast we will add the ability to deploy AWS CDK via Github Actions. This, of course, is only one provider of many, which support deploying Resources using OIDC without Hard Coded Credentials.

First, we have to create two Resources in AWS. The first one is an `OpenIdConnectProvider` which provides the Ability for the github ci runner to connect to certain Roles in our Account. This can be done by using this:

```typescript
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
```

With this in place we can create an IAM Role which allows the `AssumeRole` Permission via that Provider:

```typescript
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
```

Finally we can put those two functions into a `CDK Stack`:

```typescript
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
```

For AWS we can now create a new workflow to use this Provider. First make sure that all the permissions are in place for the Github Runner to use OpenID:

```yaml
permissions:
  # Allow repo checkout
  contents: read
  # Allow login to AWS via OIDC
  id-token: write
```

Next we can add a few steps to get credentials from AWS, Bootstrap our Account and finally deploy our Code:

```yaml
jobs:
  cdk-deploy:
    name: Deploy AWS infrastructure
    runs-on: ubuntu-latest

    steps:
      - name: Get sources
        uses: actions/checkout@v3

      - name: Set up Node.js with caching
        uses: actions/setup-node@v3
        timeout-minutes: 5
        continue-on-error: true
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "yarn"
          cache-dependency-path: "**/yarn.lock"

      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@master
        with:
          role-to-assume: ${{ env.AWS_ROLE }}
          role-session-name: ${{ github.repository_owner }}-${{ github.event.repository.name }}-github-ci-${{ github.job }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Install dependencies for AWS CDK
        run: yarn install --frozen-lockfile

      - name: CDK bootstrap
        run: |
          yarn cdk bootstrap aws://${AWS_ACCOUNT_ID}/${AWS_REGION}

      - name: CDK deploy
        run: |
          yarn cdk deploy "${STACKS}" --concurrency 10
```

Now we can go ahead and add Repository Rules like only allowing changes via PR and requiring that every PR is approved by at least 1 other Person. This makes sure that noone can just change something and Infrastructure specified in the Code is as close as possible to the Infrastructure thats actually deployed. 

But while this is all nice and well, we still are facing a few challenge to overcome:

* How to quickly repair if something goes wrong and we only have Read Only Permissions? We will take a look at that in Part 3
* How to test the Infrastructure before its deployed to main. Its not worth anything, if a single merged PR breaks everything. Thats for Part 4
* AWS CDK is not very good with Secrets. Making sure that we can deploy those without making changes manually is for Part 5.

The code for this setup is available on [github](https://github.com/itmettkeDE/blog/blob/main/2024-01-19/). Feel free to check it out!
