import { BootstrapStack } from "./bootstrap";
import * as cdk from "aws-cdk-lib";
import assert from "assert";

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
    if (this.props.parentDeployment instanceof StackSetParentSynthesizer) {
      // Forward to parent deployment. By the magic of cross-stack references any parameter
      // returned and used will magically be forwarded to the nested stack.
      return this.props.parentDeployment.addStackSetFileAsset(
        asset,
        this.props.regions,
      );
    } else {
      throw new Error(
        "Cannot add assets to a StackSet without changing syntheziser to StackSetParentSynthesizer",
      );
    }
  }

  public addDockerImageAsset(
    asset: cdk.DockerImageAssetSource,
  ): cdk.DockerImageAssetLocation {
    if (this.props.parentDeployment instanceof StackSetParentSynthesizer) {
      // Forward to parent deployment. By the magic of cross-stack references any parameter
      // returned and used will magically be forwarded to the nested stack.
      return this.props.parentDeployment.addStackSetDockerImageAsset(
        asset,
        this.props.regions,
      );
    } else {
      throw new Error(
        "Cannot add assets to a StackSet without changing syntheziser to StackSetParentSynthesizer",
      );
    }
  }

  public synthesize(session: cdk.ISynthesisSession): void {
    // Synthesize the template, but don't emit as a cloud assembly artifact.
    // It will be registered as an S3 asset of its parent instead.
    this.synthesizeTemplate(session);
  }
}

export interface StackSetParentSynthesizerProps
  extends cdk.DefaultStackSynthesizerProps {
  bootstrap: BootstrapStack;
}

export class StackSetParentSynthesizer extends cdk.DefaultStackSynthesizer {
  private bootstrap: BootstrapStack;

  constructor(props: StackSetParentSynthesizerProps) {
    super(props);
    assert(Object.keys(props.bootstrap.bootstrapBuckets).length > 0);
    this.bootstrap = props.bootstrap;
  }

  public addStackSetFileAsset(
    asset: cdk.FileAssetSource,
    regions: Set<string>,
  ): cdk.FileAssetLocation {
    let location = undefined;
    let bucketPrefix = undefined;
    for (let region of regions) {
      const bucket = this.bootstrap.bootstrapBuckets[region];
      if (bucket == undefined) {
        throw new Error(`Region ${region} was not bootstrapped`);
      }
      const destinations = {
        ...this["assetManifest"].files[asset.sourceHash]?.destinations,
      };
      bucketPrefix = bucket.bucketPrefix;
      location = this["assetManifest"].defaultAddFileAsset(
        this.boundStack,
        asset,
        {
          bucketName: bucket.bucketName,
          bucketPrefix: this["bucketPrefix"],
          role: this.bootstrap.publishRole,
        },
      );
      location!.region = bucket.region;
      destinations[bucket.bucketName] = location;
      this["assetManifest"].files[asset.sourceHash].destinations = destinations;
    }
    location = this.cloudFormationLocationFromFileAsset(location);
    const bucketName = cdk.Token.asString(
      cdk.Fn.join("", [bucketPrefix!, "-", cdk.Fn.ref("AWS::Region")]),
    );
    const s3ObjectUrl = `s3://${bucketName}/${location.objectKey}`;
    const httpUrl = `https://s3.${cdk.Fn.ref("AWS::Region")}.${cdk.Fn.ref(
      "AWS::URLSuffix",
    )}/${bucketName}/${location.objectKey}`;
    return {
      ...location,
      bucketName,
      httpUrl,
      s3ObjectUrl,
      s3ObjectUrlWithPlaceholders: s3ObjectUrl,
    };
  }

  public addStackSetDockerImageAsset(
    asset: cdk.DockerImageAssetSource,
    regions: Set<string>,
  ): cdk.DockerImageAssetLocation {
    throw new Error(
      "StackSetParentSynthesizer does not support Docker Images yet",
    );
  }
}
