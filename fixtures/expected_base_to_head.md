:ghost: This pull request introduces changes to CloudFormation templates :ghost:

<details>
<summary><b>CDK synth diff summary</b></summary>

```
Files base.cdk.out/example.template.yaml and head.cdk.out/example.template.yaml differ
```

</details>

<details>
<summary><b>CDK synth diff details</b></summary>
  
```diff
diff -u base.cdk.out/example.template.yaml head.cdk.out/example.template.yaml
--- base.cdk.out/example.template.yaml	2020-09-15 22:29:48.253388109 +0000
+++ head.cdk.out/example.template.yaml	2020-09-15 22:29:48.297389433 +0000
@@ -57,7 +57,7 @@
     Properties:
       EndpointConfiguration:
         Types:
-          - REGIONAL
+          - EDGE
       Name: Gateway
     Metadata:
       aws:cdk:path: example/Gateway/Resource
```

</details>
