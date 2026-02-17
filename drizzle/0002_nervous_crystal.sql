CREATE TABLE `clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`baseUrl` varchar(512) NOT NULL,
	`userName` varchar(255) NOT NULL,
	`password` text NOT NULL,
	`clientId` text NOT NULL,
	`clientSecret` text NOT NULL,
	`primaryColor` varchar(7) NOT NULL DEFAULT '#10b981',
	`isActive` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clients_id` PRIMARY KEY(`id`)
);
