# StackSets in CDK with Assets

Now that we can use StackSets in AWS CDK (take a look at [Part 1](https://www.linkedin.com/pulse/stacksets-cdk-marc-mettke-yezhe/), if you missed it), it would be very nice, if we could use Assets too.

And surprisingly enough, this once again is not very hard to do! All we need is a `Bootstrap Stack` similar to the one from CDK itself where AWS CDK can upload the Assets to.

To make this work, we can use the StackSet implemented in the first part and use it to deploy an AWS S3 Bucket in every region our application is supposed to reside in. Putting that in a stack we get this:

```typescript
const bootstrap = new stacksets.BootstrapStack(app, "BootstrapStack", {
  regions: new Set(["eu-central-1", "eu-west-1"]),
  removalPolicy: cdk.RemovalPolicy.DESTROY,
});
```

With that in place we can modify the Synthesizer of our Application stack and reference the bootstrap stack:

```typescript
const test = new TestStack(app, "TestStack", {
  regions: new Set(["eu-central-1", "eu-west-1"]),
  synthesizer: new stacksets.StackSetParentSynthesizer({
    bootstrap,
  }),
});
test.addDependency(bootstrap);
```

And thats it! CDK automatically uploads all Assets used in any StackSet defined in the `TestStack` to the S3 Buckets created by the `BootstrapStack`. 

To test this, lets create an s3Asset inside the StackSet:

```typescript
export class TestStackSetUnmanaged extends stacksets.UnmanagedStackSetStack {
  constructor(
    scope: Construct,
    id: string,
    props: stacksets.UnmanagedStackSetStackProps,
  ) {
    super(scope, id, props);

    const asset = new s3Assets.Asset(this, "SampleAsset", {
      path: path.join(__dirname, "test-asset.txt"),
    });
    new ssm.StringParameter(this, "TestParam", {
      parameterName: "TestStackSetManaged",
      stringValue: asset.s3ObjectUrl,
    });
  }
}
```

Once deployed the SSM Parameter will point to the Asset in the Bootstrap S3 Bucket of that particular region. Nice and easy.

This, of course, works with all kinds of Resources like Lambdas or Ec2 Assets. No further changes needed.

While it does not allow us to add Docker Images, its easy to add too with only a few changes required to the Bootstrap Stack and the Synthesizer. But that is left to the reader.

Checkout the Code on [github](https://github.com/itmettkeDE/blog/blob/main/2024-01-05/) and let me know what you think!
