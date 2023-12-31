import * as cdk from "aws-cdk-lib";

export interface StackSetSynthesizerProps {
  parentDeployment: cdk.IStackSynthesizer;
  regions: Set<string>;
}

export class StackSetSynthesizer extends cdk.StackSynthesizer {
  constructor(private readonly props: StackSetSynthesizerProps) {
    super();
  }

  public get bootstrapQualifier(): string | undefined {
    return this.props.parentDeployment.bootstrapQualifier;
  }

  public addFileAsset(asset: cdk.FileAssetSource): cdk.FileAssetLocation {
    throw new Error(
      "Cannot add assets to a StackSet without changing syntheziser to StackSetParentSynthesizer",
    );
  }

  public addDockerImageAsset(
    asset: cdk.DockerImageAssetSource,
  ): cdk.DockerImageAssetLocation {
    throw new Error(
      "Cannot add assets to a StackSet without changing syntheziser to StackSetParentSynthesizer",
    );
  }

  public synthesize(session: cdk.ISynthesisSession): void {
    // Synthesize the template, but don't emit as a cloud assembly artifact.
    // It will be registered as an S3 asset of its parent instead.
    this.synthesizeTemplate(session);
  }
}
