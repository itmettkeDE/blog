# CDK Test Environments: Elevating Your Deployment Game with Git Branches

Ensuring the robustness of your platform before pushing changes to production is paramount. While a generic development environment aids in this process, it often falls short due to its shared nature, making it challenging to test amidst experimental changes.

Local environments on individual machines offer a partial solution, yet the hassle of installation and maintenance, coupled with the inability to abstract every service, persists.

Enter a game-changer – branch-specific deployments using CI. This innovative approach effortlessly creates dedicated environments for each branch, simplifying testing and minimizing disruptions caused by experimental changes. It not only streamlines testing but also facilitates automated tests on the entire product before any changes move forward.

Implementing branch-specific deployments in CDK becomes a breeze with [Stages](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.Stage.html). By segregating Stacks based on the desired environment, CDK empowers us to deploy specific environments selectively.

Before diving in, set up two AWS Accounts – one exclusively for production and the other for dev and branch environments. This isolation shields the production environment from any developmental hiccups.

Let's kick things off by crafting a \`TestStack\` that creates an SSM Parameter:

\`\`\`typescript
$(cat cdk.ts | sed -n '8,17p;18q')
\`\`\`

To distinguish between environments explicitly, define an Enum:

\`\`\`typescript
$(cat cdk.ts | sed -n '21,25p;26q')
\`\`\`

Now, let's bring our Stacks to life, deploying some in all environments and other in specific environments using the \`envType\` Variable:

\`\`\`typescript
$(cat cdk.ts | sed -n '19,20p;50,60p;61q')
\`\`\`

The \`StageRef\` Interface comes into play, enabling us to share References between the \`Dev\` Environment and \`Branch\` Environments, minimizing costs by avoiding the creation of duplicate resources.

Creating the Stages is the final piece of the puzzle:

\`\`\`typescript
$(cat cdk.ts | sed -n '27,48p;49q')
\`\`\`

Now, when you run BRANCH_NAME="test_branch" cdk list, you'll see this:

\`\`\`
Prod/ProdOnlyTestStack
Prod/TestStack
Dev/TestStack
test-branch/TestStack
\`\`\`

The \ separator between Environment and Stacks enables a clean seperation of the Branch Environment, making deployments only a matter of:

\`\`\`bash
BRANCH_NAME="test_branch" cdk deploy "test-branch/*"
\`\`\`

Revamping your CI/CD Workflow becomes a breeze with these commands:

\`\`\`bash
# See differences between the deployed Branch Environment and the changes in the last commit
BRANCH_NAME="test_branch" cdk diff "test-branch/*"
# Deploy the Branch Environment
BRANCH_NAME="test_branch" cdk deploy "test-branch/*"
# Destroy the Branch Environment once the branch is deleted
BRANCH_NAME="test_branch" cdk destroy "test-branch/*"

# See differences between the deployed Prod/Dev Environment and the changes this branch would perform once merged.
cdk diff "Prod/*"
cdk diff "Dev/*"
\`\`\`

And voila! Every branch is granted its own environment, eliminating the need for local setups. This accelerates onboarding, allowing new contributors to make changes without the burden of setting up machines. Furthermore, it paves the way for comprehensive Integration Tests, ensuring the correct operation of the entire platform.

This article is part 4 of a series on a Read-Only AWS Organization Setup:
* How to setup Read Only Access ([Part 1](https://www.linkedin.com/pulse/aws-organization-read-only-access-marc-mettke-5gaae/))
* How to setup CI Deployment ([Part 2](https://www.linkedin.com/pulse/ci-infrastructure-deployment-aws-marc-mettke-cange/))
* How to implement Emergency Access ([Part 3](https://www.linkedin.com/pulse/aws-cross-account-emergency-access-marc-mettke-bcnke/))
* How to support testing a branch (You're here!)
* How to deploy Secrets (Part 5)

Stay tuned for more insights, and don't forget to explore the full source code on [GitHub](https://github.com/itmettkeDE/blog/blob/main/${PWD##*/}/).
