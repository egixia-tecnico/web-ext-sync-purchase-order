ALTER TABLE `integration_logs` ADD `httpMethod` varchar(10) DEFAULT 'GET' NOT NULL;--> statement-breakpoint
ALTER TABLE `integration_logs` ADD `requestHeaders` text;--> statement-breakpoint
ALTER TABLE `integration_logs` ADD `httpStatusCode` int;--> statement-breakpoint
ALTER TABLE `integration_logs` ADD `rawResponse` text;--> statement-breakpoint
ALTER TABLE `integration_logs` ADD `serviceName` varchar(100);--> statement-breakpoint
ALTER TABLE `integration_logs` ADD `executionTimeMs` int;