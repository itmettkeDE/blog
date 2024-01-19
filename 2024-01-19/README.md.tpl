# CI Infrastructure Deployment with AWS

Reacting to problems and new situation by quickly changing Infrastructure on the AWS Management Console is very problematic in the long run. Yes it does solve the problem now, but very often it leads to problems down the road when changes do not match the expected Infrastructure defined in the Source Code.

In [Part 1](https://www.linkedin.com/pulse/aws-organization-read-only-access-marc-mettke-5gaae/), we took away this situation by granting only Read Only Permissions to most of the users. To make sure that we can still move fast we will add the ability to deploy AWS CDK via Github Actions. This, of course, is only one provider of many, which support deploying Resources using OIDC without Hard Coded Credentials.

First, we have to create two Resources in AWS. The first one is an \`OpenIdConnectProvider\` which provides the Ability for the github ci runner to connect to certain Roles in our Account. This can be done by using this:

\`\`\`typescript
$(cat cdk.ts | sed -n '8,19p;20q')
\`\`\`

With this in place we can create an IAM Role which allows the \`AssumeRole\` Permission via that Provider:

\`\`\`typescript
$(cat cdk.ts | sed -n '21,55p;56q')
\`\`\`

Finally we can put those two functions into a \`CDK Stack\`:

\`\`\`typescript
$(cat cdk.ts | sed -n '57,77p;78q')
\`\`\`

For AWS we can now create a new workflow to use this Provider. First make sure that all the permissions are in place for the Github Runner to use OpenID:

\`\`\`yaml
$(cat github_workflow.yaml | sed -n '9,13p;14q')
\`\`\`

Next we can add a few steps to get credentials from AWS, Bootstrap our Account and finally deploy our Code:

\`\`\`yaml
$(cat github_workflow.yaml | sed -n '25,63p;64q')
\`\`\`

Now we can go ahead and add Repository Rules like only allowing changes via PR and requiring that every PR is approved by at least 1 other Person. This makes sure that noone can just change something and Infrastructure specified in the Code is as close as possible to the Infrastructure thats actually deployed. 

But while this is all nice and well, we still are facing a few challenge to overcome:

* How to quickly repair if something goes wrong and we only have Read Only Permissions? We will take a look at that in Part 3
* How to test the Infrastructure before its deployed to main. Its not worth anything, if a single merged PR breaks everything. Thats for Part 4
* AWS CDK is not very good with Secrets. Making sure that we can deploy those without making changes manually is for Part 5.

The code for this setup is available on [github](https://github.com/itmettkeDE/blog/blob/main/${PWD##*/}/). Feel free to check it out!
