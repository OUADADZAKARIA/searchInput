import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';

export class MatomoFargateStack extends cdk.Stack {
    constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const vpc = new ec2.Vpc(this, 'MatomoVpc', { maxAzs: 2 });

        // Groupes de sécurité
        const webSecurityGroup = new ec2.SecurityGroup(this, 'WebSG', { vpc });
        const appSecurityGroup = new ec2.SecurityGroup(this, 'AppSG', { vpc });

        webSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP');
        appSecurityGroup.addIngressRule(webSecurityGroup, ec2.Port.tcp(9000), 'Allow PHP-FPM from NGINX');

        const cluster = new ecs.Cluster(this, 'MatomoCluster', { vpc });

        // Définition de la tâche ECS
        const taskDefinition = new ecs.FargateTaskDefinition(this, 'MatomoTaskDef', {
            cpu: 512,
            memoryLimitMiB: 1024,
        });

        // Conteneur PHP-FPM (Matomo)
        const phpFpmContainer = taskDefinition.addContainer('MatomoPHPFPM', {
            image: ecs.ContainerImage.fromAsset('./matomo'),
            memoryLimitMiB: 512,
            logging: new ecs.AwsLogDriver({
                streamPrefix: 'MatomoPHPFPMLogs',
                logGroup: new logs.LogGroup(this, 'MatomoPHPFPMLogGroup', { retention: logs.RetentionDays.ONE_WEEK }),
            }),
        });
        phpFpmContainer.addPortMappings({ containerPort: 9000 });

        // Conteneur NGINX
        const nginxContainer = taskDefinition.addContainer('MatomoNginx', {
            image: ecs.ContainerImage.fromAsset('./nginx'),
            memoryLimitMiB: 512,
            logging: new ecs.AwsLogDriver({
                streamPrefix: 'MatomoNginxLogs',
                logGroup: new logs.LogGroup(this, 'MatomoNginxLogGroup', { retention: logs.RetentionDays.ONE_WEEK }),
            }),
            essential: true,
        });
        nginxContainer.addPortMappings({ containerPort: 80 });

        // Service ECS Fargate
        const fargateService = new ecs.FargateService(this, 'MatomoFargateService', {
            cluster,
            taskDefinition,
            securityGroups: [appSecurityGroup],
            assignPublicIp: true,
        });

        // Load Balancer
        const alb = new elbv2.ApplicationLoadBalancer(this, 'MatomoALB', {
            vpc,
            internetFacing: true,
            securityGroup: webSecurityGroup,
        });

        const listener = alb.addListener('MatomoListener', { port: 80 });

        listener.addTargets('MatomoTarget', {
            port: 80,
            targets: [fargateService],
            healthCheck: { path: '/matomo.php', interval: cdk.Duration.minutes(1) },
        });

        new cdk.CfnOutput(this, 'MatomoURL', {
            value: `http://${alb.loadBalancerDnsName}`,
        });
    }
}