DROP TABLE `api_configs`;--> statement-breakpoint
ALTER TABLE `clients` MODIFY COLUMN `password` varchar(512) NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` MODIFY COLUMN `clientId` varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` MODIFY COLUMN `clientSecret` varchar(512) NOT NULL;