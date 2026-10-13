CREATE TYPE "public"."assignment_status" AS ENUM('assigned', 'on_trip', 'at_terminal', 'ended');--> statement-breakpoint
CREATE TYPE "public"."crowding_status" AS ENUM('not_reported', 'seats_available', 'standing_only', 'full');--> statement-breakpoint
CREATE TYPE "public"."service_type" AS ENUM('regular', 'premium', 'special');--> statement-breakpoint
CREATE TYPE "public"."day_type" AS ENUM('weekday', 'weekend');--> statement-breakpoint
CREATE TYPE "public"."flip_type" AS ENUM('auto', 'confirmed');--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "admin_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	CONSTRAINT "admins_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "assignment_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"assignment_id" integer NOT NULL,
	"from_route_direction_id" integer NOT NULL,
	"to_route_direction_id" integer NOT NULL,
	"status_at_change" "assignment_status" NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"vehicle_id" integer NOT NULL,
	"driver_id" integer NOT NULL,
	"route_direction_id" integer NOT NULL,
	"status" "assignment_status" DEFAULT 'assigned' NOT NULL,
	"service_type" "service_type" DEFAULT 'regular' NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"last_ping_at" timestamp with time zone,
	"crowding" "crowding_status" DEFAULT 'not_reported' NOT NULL,
	"crowding_set_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"driver_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "driver_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	CONSTRAINT "drivers_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" serial PRIMARY KEY NOT NULL,
	"plate" text NOT NULL,
	CONSTRAINT "vehicles_plate_unique" UNIQUE("plate")
);
--> statement-breakpoint
CREATE TABLE "warnings" (
	"id" serial PRIMARY KEY NOT NULL,
	"assignment_id" integer NOT NULL,
	"type" text NOT NULL,
	"severity" text DEFAULT 'warning' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"detail" text
);
--> statement-breakpoint
CREATE TABLE "route_directions" (
	"id" serial PRIMARY KEY NOT NULL,
	"route_id" integer NOT NULL,
	"direction_name" text NOT NULL,
	"path" geometry(LineString,4326),
	CONSTRAINT "route_directions_route_id_direction_name_unique" UNIQUE("route_id","direction_name")
);
--> statement-breakpoint
CREATE TABLE "routes" (
	"id" serial PRIMARY KEY NOT NULL,
	"route_number" text NOT NULL,
	"name" text,
	"name_am" text,
	CONSTRAINT "routes_route_number_unique" UNIQUE("route_number")
);
--> statement-breakpoint
CREATE TABLE "route_stops" (
	"id" serial PRIMARY KEY NOT NULL,
	"route_direction_id" integer NOT NULL,
	"stop_id" integer NOT NULL,
	"stop_order" integer NOT NULL,
	CONSTRAINT "route_stops_route_direction_id_stop_order_unique" UNIQUE("route_direction_id","stop_order")
);
--> statement-breakpoint
CREATE TABLE "stops" (
	"id" serial PRIMARY KEY NOT NULL,
	"side" text,
	"place_name" text NOT NULL,
	"place_name_am" text,
	"location" geometry(Point,4326) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departures" (
	"id" serial PRIMARY KEY NOT NULL,
	"assignment_id" integer NOT NULL,
	"terminal_stop_id" integer NOT NULL,
	"from_route_direction_id" integer NOT NULL,
	"to_route_direction_id" integer,
	"arrived_at" timestamp with time zone NOT NULL,
	"departing_now_at" timestamp with time zone,
	"departed_at" timestamp with time zone,
	"flip_type" "flip_type",
	"crowding_at_departure" "crowding_status",
	"layover_seconds" integer
);
--> statement-breakpoint
CREATE TABLE "location_pings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"assignment_id" integer NOT NULL,
	"route_direction_id" integer NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"location" geometry(Point,4326) NOT NULL,
	"speed_kmh" real,
	"accuracy_m" real,
	"progress" double precision,
	"path_distance_m" real,
	"crowding" "crowding_status" DEFAULT 'not_reported' NOT NULL,
	"crowding_set_at" timestamp with time zone,
	"time_trusted" boolean DEFAULT true NOT NULL,
	"stationary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "pings_assignment_time_uq" UNIQUE("assignment_id","recorded_at")
);
--> statement-breakpoint
CREATE TABLE "segment_times" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_stop_id" integer NOT NULL,
	"to_stop_id" integer NOT NULL,
	"day_type" "day_type" NOT NULL,
	"time_bucket" integer NOT NULL,
	"seconds" integer NOT NULL,
	"measured" boolean DEFAULT false NOT NULL,
	"sample_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "segment_times_from_stop_id_to_stop_id_day_type_time_bucket_unique" UNIQUE("from_stop_id","to_stop_id","day_type","time_bucket")
);
--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_changes" ADD CONSTRAINT "assignment_changes_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_changes" ADD CONSTRAINT "assignment_changes_from_route_direction_id_route_directions_id_fk" FOREIGN KEY ("from_route_direction_id") REFERENCES "public"."route_directions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_changes" ADD CONSTRAINT "assignment_changes_to_route_direction_id_route_directions_id_fk" FOREIGN KEY ("to_route_direction_id") REFERENCES "public"."route_directions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_route_direction_id_route_directions_id_fk" FOREIGN KEY ("route_direction_id") REFERENCES "public"."route_directions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_sessions" ADD CONSTRAINT "driver_sessions_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warnings" ADD CONSTRAINT "warnings_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_directions" ADD CONSTRAINT "route_directions_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_route_direction_id_route_directions_id_fk" FOREIGN KEY ("route_direction_id") REFERENCES "public"."route_directions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_stop_id_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."stops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departures" ADD CONSTRAINT "departures_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departures" ADD CONSTRAINT "departures_terminal_stop_id_stops_id_fk" FOREIGN KEY ("terminal_stop_id") REFERENCES "public"."stops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departures" ADD CONSTRAINT "departures_from_route_direction_id_route_directions_id_fk" FOREIGN KEY ("from_route_direction_id") REFERENCES "public"."route_directions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departures" ADD CONSTRAINT "departures_to_route_direction_id_route_directions_id_fk" FOREIGN KEY ("to_route_direction_id") REFERENCES "public"."route_directions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_pings" ADD CONSTRAINT "location_pings_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_pings" ADD CONSTRAINT "location_pings_route_direction_id_route_directions_id_fk" FOREIGN KEY ("route_direction_id") REFERENCES "public"."route_directions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segment_times" ADD CONSTRAINT "segment_times_from_stop_id_stops_id_fk" FOREIGN KEY ("from_stop_id") REFERENCES "public"."stops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segment_times" ADD CONSTRAINT "segment_times_to_stop_id_stops_id_fk" FOREIGN KEY ("to_stop_id") REFERENCES "public"."stops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stops_place_name_idx" ON "stops" USING btree ("place_name");--> statement-breakpoint
CREATE INDEX "stops_location_gix" ON "stops" USING gist ("location");--> statement-breakpoint
CREATE INDEX "pings_assignment_time_idx" ON "location_pings" USING btree ("assignment_id","recorded_at");--> statement-breakpoint
CREATE INDEX "pings_location_gix" ON "location_pings" USING gist ("location");