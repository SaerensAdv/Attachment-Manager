import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

/**
 * Uitgegeven facturen. Een rij ontstaat alleen wanneer een factuur effectief
 * wordt uitgegeven (niet bij een proforma-preview), zodat de nummering
 * sluitend (gapless) blijft.
 *
 * Nummering: `seq` is een per-jaar oplopende teller, afgedwongen door de unieke
 * index op (year, seq). De volgnummerberekening gebeurt atomair in één INSERT
 * (COALESCE(MAX(seq),0)+1) met retry op een unieke-constraint-botsing, zodat
 * gelijktijdige uitgiftes nooit een gat of duplicaat opleveren. `number` is de
 * leesbare weergave, bv. "2026-001".
 *
 * De ontvanger- en afzendergegevens worden als snapshot bevroren op het moment
 * van uitgifte, zodat een herdruk identiek blijft ook als het klantdossier of
 * de afzenderconfig later wijzigt. Bedragen staan in centen.
 */
export const invoicesTable = pgTable(
  "invoices",
  {
    id: serial("id").primaryKey(),
    year: integer("year").notNull(),
    seq: integer("seq").notNull(),
    number: text("number").notNull(),
    clientId: integer("client_id").references(() => clientsTable.id, {
      onDelete: "set null",
    }),
    issuedAt: timestamp("issued_at").defaultNow().notNull(),
    dueDate: timestamp("due_date").notNull(),
    periodLabel: text("period_label"),
    // Ontvanger-snapshot (bevroren bij uitgifte).
    recipientName: text("recipient_name").notNull(),
    recipientAddress: text("recipient_address"),
    recipientVatNumber: text("recipient_vat_number"),
    recipientCountry: text("recipient_country"),
    btwMode: text("btw_mode").notNull(),
    lineLabel: text("line_label").notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    vatRateBp: integer("vat_rate_bp").notNull(),
    vatCents: integer("vat_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    // Afzender-snapshot als JSON, voor identieke herdruk.
    senderSnapshot: text("sender_snapshot").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("invoices_year_seq_unique").on(t.year, t.seq)],
);

export type Invoice = typeof invoicesTable.$inferSelect;
export type InsertInvoice = typeof invoicesTable.$inferInsert;
