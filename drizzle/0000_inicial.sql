CREATE TABLE `movimiento_stock` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`producto_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`cantidad` integer NOT NULL,
	`motivo` text,
	`creado_en` integer NOT NULL,
	FOREIGN KEY (`producto_id`) REFERENCES `producto`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "movimiento_tipo_valido" CHECK("movimiento_stock"."tipo" in ('ingreso', 'egreso', 'ajuste')),
	CONSTRAINT "movimiento_cantidad_coherente" CHECK(typeof("movimiento_stock"."cantidad") = 'integer' and (("movimiento_stock"."tipo" in ('ingreso', 'egreso') and "movimiento_stock"."cantidad" > 0) or ("movimiento_stock"."tipo" = 'ajuste' and "movimiento_stock"."cantidad" <> 0)))
);
--> statement-breakpoint
CREATE INDEX `ix_movimiento_stock_producto` ON `movimiento_stock` (`producto_id`,`id`);--> statement-breakpoint
CREATE TABLE `producto` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`principio_activo` text,
	`numero_troquel` text,
	`codigo_barras` text NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	`creado_en` integer NOT NULL,
	`actualizado_en` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ix_producto_codigo_barras` ON `producto` (`codigo_barras`);--> statement-breakpoint
CREATE INDEX `ix_producto_numero_troquel` ON `producto` (`numero_troquel`);--> statement-breakpoint
CREATE INDEX `ix_producto_nombre` ON `producto` (`nombre`);--> statement-breakpoint
CREATE INDEX `ix_producto_principio_activo` ON `producto` (`principio_activo`);--> statement-breakpoint
CREATE TABLE `stock` (
	`producto_id` integer PRIMARY KEY NOT NULL,
	`cantidad` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`producto_id`) REFERENCES `producto`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "stock_cantidad_entera" CHECK(typeof("stock"."cantidad") = 'integer'),
	CONSTRAINT "stock_cantidad_no_negativa" CHECK("stock"."cantidad" >= 0)
);
