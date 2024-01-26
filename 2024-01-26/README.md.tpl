# AWS Cross-Account Emergency Access

In the last Parts, we had a look at how to improve [Infrastructure reliability by only using Read Only Access](https://www.linkedin.com/pulse/aws-organization-read-only-access-marc-mettke-5gaae/) and how to [Deploy AWS CDK via GitHub Actions](https://www.linkedin.com/pulse/ci-infrastructure-deployment-aws-marc-mettke-cange/).

But an important point still left open is how to perform changes in an emergency when quick reactions are important and necessary. While we do want to reduce these situations as much as possible to prevent our Infrastructure from deriving from the Software Defined Setup, we cannot afford to not be able to react.

And we also do not have to. Because AWS does provide easy ways to give certain people elevated access permissions for one or more Accounts. Let's take a look at how to build that using this structure:

![How to setup Read Only Access in AWS](../2024-01-12/read_only_access.drawio.png "Read Only Access Setup")

There are three teams with three different Requirements. The User is already implemented, leaving the Product Security Champion who needs Emergency Access to all the Accounts of the Product that he supervises, and the Cloud Engineering Team which wants to quickly act if their intervention is required.

In the first step, we will create the required Access for the Product Security Champion. We need a new AWS Identity Center Permission Set:

\`\`\`typescript
$(cat cdk.ts | sed -n '66,90p;91q')
\`\`\`

This Permission Set is connected directly to Accounts which have a Product Security Champion that needs access. They provide direct Write Access to all Services in that Accounts.

The second Permission Set is for the Cloud Engineering Team:

\`\`\`typescript
$(cat cdk.ts | sed -n '92,121p;122q')
\`\`\`

In contrast to the first Permission Set, this one is only connected to a special \`Emergency Access\` Account and only allows one to assume another Role. This Role will be deployed to every Account in the Organization using a Cloudformation StackSet. To connect those two, we use this function:

\`\`\`typescript
$(cat cdk.ts | sed -n '123,141p;142q')
\`\`\`

And then we can connect it like this:

\`\`\`typescript
$(cat cdk.ts | sed -n '11,38p;142p;143q')
\`\`\`

The last thing left to do is to provide the Role for the Emergency Access required by the Cloud Engineering Team. For this, we will create this [StackSet](https://www.linkedin.com/pulse/stacksets-cdk-marc-mettke-yezhe/):

\`\`\`typescript
$(cat cdk.ts | sed -n '180,209p;211q')
\`\`\`

Now the foundation is available. We limited the Permissions for most Users and provided special Roles to be able to act in Emergencies. Now the only things left are these:

* How to test the Infrastructure before it is deployed to main. It's not worth anything if a single merged PR breaks everything. Thats for Part 4
* AWS CDK is not very good with Secrets. Making sure that we can deploy those without making changes manually is for Part 5.

As always the code for this setup is available on [GitHub](https://github.com/itmettkeDE/blog/blob/main/${PWD##*/}/). Feel free to check it out!
