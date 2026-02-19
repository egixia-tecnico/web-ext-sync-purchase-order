CREATE TABLE `integration_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`url` varchar(1024) NOT NULL,
	`requestBody` text,
	`responseBody` text,
	`token` varchar(50),
	`authPrefix` varchar(20) DEFAULT 'Bearer',
	`status` varchar(20) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `integration_logs_id` PRIMARY KEY(`id`)
);
