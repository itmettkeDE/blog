# StackSets in CDK

StackSets in AWS CDK are hard. But do they have to be?

While CDK itself does not support StackSets yet, it is easy to create a structure similar to [NestedStack](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.NestedStack.html), which does allow defining a normal Stack, while still allowing it to be deployed as StackSet in multiple Accounts and Regions.

How? Like this to create an Unmanaged Stack deploying an ssm Parameter:

```typescript
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
```

To deploy this, simply add it as resource to a normal CDK Stack like this:

```typescript
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
  }
}
```

And before you now it, you got a Stack deployed as Stackset in multiple Accounts and Regions. Find the code on [github](https://github.com/itmettkeDE/blog/blob/main/2023-12-31/) and try it out yourself.

Of course there are a few difficulties here and there that one needs to be aware of:

- You cannot deploy Resources requiring Assets (yet). But that will be addressed in [Part 2](https://www.linkedin.com/pulse/stacksets-cdk-assets-marc-mettke-ufrke), so stay tuned.
- Cross Stack References do not work if the Stack is deployed in another Region. Make sure to use the `addParameter` Function inside the Stack for the StackSet to circument this.

Let me know what you think and the features you would like to see in AWS CDK.
