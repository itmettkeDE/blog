# StackSets in CDK

StackSets in AWS CDK are hard. But do they have to be?

While CDK itself does not support StackSets yet, it is easy to create a structure similar to [NestedStack](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.NestedStack.html), which does allow defining a normal Stack, while still allowing it to be deployed as StackSet in multiple Accounts and Regions.

How? Like this to create an Unmanaged Stack deploying an ssm Parameter:

\`\`\`typescript
$(cat cdk.ts | sed -n '60,73p;74q')
\`\`\`

To deploy this, simply add it as resource to a normal CDK Stack like this:

\`\`\`typescript
$(cat cdk.ts | sed -n '9,34p;57,58p;59q')
\`\`\`

And before you now it, you got a Stack deployed as Stackset in multiple Accounts and Regions. Find the code on [github](https://github.com/itmettkeDE/blog/blob/main/2023-12-31/) and try it out yourself.

Of course there are a few difficulties here and there that one needs to be aware of:

- You cannot deploy Resources requiring Assets (yet). But that will be addressed in Part 2, so stay tuned.
- Cross Stack References do not work if the Stack is deployed in another Region. Make sure to use the \`addParameter\` Function inside the Stack for the StackSet to circument this.

Let me know what you think and the features you would like to see in AWS CDK.
