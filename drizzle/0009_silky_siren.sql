ALTER TABLE `clients` ADD `batchSize` int DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `batchDelaySeconds` int DEFAULT 3 NOT NULL;