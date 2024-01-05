# StackSets in CDK with Assets

Now that we can use StackSets in AWS CDK (take a look at [Part 1](https://www.linkedin.com/pulse/stacksets-cdk-marc-mettke-yezhe/), if you missed it), it would be very nice, if we could use Assets too.

And surprisingly enough, this once again is not very hard to do! All we need is a \`Bootstrap Stack\` similar to the one from CDK itself where AWS CDK can upload the Assets to.

To make this work, we can use the StackSet implemented in the first part and use it to deploy an AWS S3 Bucket in every region our application is supposed to reside in. Putting that in a stack we get this:

\`\`\`typescript
$(cat cdk.ts | sed -n '99,102p;103q')
\`\`\`

With that in place we can modify the Synthesizer of our Application stack and reference the bootstrap stack:

\`\`\`typescript
$(cat cdk.ts | sed -n '104,110p;111q')
\`\`\`

And thats it! CDK automatically uploads all Assets used in any StackSet defined in the \`TestStack\` to the S3 Buckets created by the \`BootstrapStack\`. 

To test this, lets create an s3Asset inside the StackSet:

\`\`\`typescript
$(cat cdk.ts | sed -n '62,78p;79q')
\`\`\`

Once deployed the SSM Parameter will point to the Asset in the Bootstrap S3 Bucket of that particular region. Nice and easy.

This, of course, works with all kinds of Resources like Lambdas or Ec2 Assets. No further changes needed.

While it does not allow us to add Docker Images, its easy to add too with only a few changes required to the Bootstrap Stack and the Synthesizer. But that is left to the reader.

Checkout the Code on [github](https://github.com/itmettkeDE/blog/blob/main/${PWD##*/}/) and let me know what you think!
