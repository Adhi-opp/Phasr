-- A quote request used to be set to CLOSED the moment its last bid slot
-- filled. acceptQuoteAction refuses anything that is not OPEN, so its buyer
-- could then accept none of the bids that had filled it.
--
-- CLOSED now means only that the buyer accepted a quote, and a full request
-- stays OPEN (submitQuoteTransaction). This reopens every request closed the
-- old way. Such a request is recognisable exactly: CLOSED with no accepted
-- quote, since accepting is the only other path that sets CLOSED.
--
-- Data only, and idempotent: a second run matches nothing. A reopened request
-- past its expiresAt still takes no bids; its buyer can accept any of its
-- quotes still inside their own validity, as on any other request.
UPDATE "QuoteRequest" AS qr
SET "status" = 'OPEN'
WHERE qr."status" = 'CLOSED'
  AND NOT EXISTS (
    SELECT 1
    FROM "Quote" AS q
    WHERE q."quoteRequestId" = qr."id"
      AND q."status" = 'ACCEPTED'
  );
