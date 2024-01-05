var awsV3S3;
try {
  const s3 = require("@aws-sdk/client-s3");
  awsV3S3 = {
    client: new s3.S3Client({}),
    c: s3,
  };
} catch (err) {}

var awsV2S3;
if (awsV3S3 === undefined) {
  try {
    const awsV2 = require("aws-sdk");
    awsV2S3 = new awsV2.S3();
  } catch (err) {}
}

if (awsV3S3 === undefined && awsV2S3 === undefined) {
  throw Error("Missing AWS SDK v2 or v3");
}

var cfnresponse = require("cfn-response");

exports.handler = async (event, context) => {
  console.log("Event:");
  console.log(event);
  var response = cfnresponse.SUCCESS;
  try {
    switch (event.RequestType) {
      case "Create":
        break;
      case "Update":
        break;
      case "Delete":
        await onDelete();
        break;
    }
  } catch (error) {
    console.error(error);
    response = cfnresponse.FAILED;
  }
  await send(event, context, response);
};

function send(event, context, response) {
  return new Promise(() => {
    cfnresponse.send(event, context, response, {}, "DeleteBucketObjects");
  });
}

async function onDelete() {
  const bucket = process.env.BUCKET;
  console.log(`Emptying bucket ${bucket}`);

  const paramList = { Bucket: bucket };
  var listedObjects;
  if (awsV3S3 !== undefined) {
    listedObjects = await awsV3S3.client.send(
      new awsV3S3.c.ListObjectVersionsCommand(paramList),
    );
  } else {
    listedObjects = await awsV2S3.listObjectVersions(paramList).promise();
  }

  const contents = [
    ...(listedObjects.Versions ?? []),
    ...(listedObjects.DeleteMarkers ?? []),
  ];
  if (contents.length === 0) {
    return;
  }

  const records = contents.map((record) => ({
    Key: record.Key,
    VersionId: record.VersionId,
  }));
  const paramDelete = { Bucket: bucket, Delete: { Objects: records } };
  var listedObjects;
  if (awsV3S3 !== undefined) {
    listedObjects = await awsV3S3.client.send(
      new awsV3S3.c.DeleteObjectsCommand(paramDelete),
    );
  } else {
    listedObjects = await awsV2S3.deleteObjects(paramDelete).promise();
  }

  if (listedObjects?.IsTruncated) {
    await onDelete();
  }
}
