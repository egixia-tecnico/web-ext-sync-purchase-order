CREATE TABLE `api_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`configName` varchar(255) NOT NULL DEFAULT 'default',
	`baseUrl` varchar(512) NOT NULL,
	`userName` varchar(255) NOT NULL,
	`password` varchar(512) NOT NULL,
	`clientId` varchar(255) NOT NULL,
	`clientSecret` varchar(512) NOT NULL,
	`isDefault` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `api_configs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `verification_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`totalRecords` int NOT NULL DEFAULT 0,
	`synced` int NOT NULL DEFAULT 0,
	`notFound` int NOT NULL DEFAULT 0,
	`supplierNotExists` int NOT NULL DEFAULT 0,
	`errors` int NOT NULL DEFAULT 0,
	`executionTimeMs` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `verification_logs_id` PRIMARY KEY(`id`)
);
