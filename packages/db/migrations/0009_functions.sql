-- model_availability: the one deliberate hole in the partner wall.
-- A partner must see how many units of each model are free for its dates, and that figure has to
-- count every company's reservations. The function runs with the owner's rights and returns a
-- count per model, never a row, a company or a date from someone else's booking.

CREATE FUNCTION model_availability(p_from date, p_until date)
RETURNS TABLE (product_model_id uuid, units_free integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_from IS NULL OR p_until IS NULL OR p_until < p_from THEN
    RAISE EXCEPTION 'the end date must not be before the start date'
      USING ERRCODE = '22023';
  END IF;
  -- Bounds the work one call can ask for; bookings themselves are capped far below this.
  IF p_until - p_from > 366 THEN
    RAISE EXCEPTION 'the date range must not exceed 366 days'
      USING ERRCODE = '22023';
  END IF;

  -- A unit counts when it is on the shelf or physically expected back (on demo, returned,
  -- being inspected) and no occupying reservation overlaps the window. Both ends of the
  -- window are inclusive, which '[]' expresses.
  RETURN QUERY
  SELECT m.id, count(a.id)::integer
    FROM product_models m
    LEFT JOIN assets a
      ON a.product_model_id = m.id
     AND a.status IN ('in_stock', 'returned', 'under_inspection', 'on_demo')
     AND NOT EXISTS (
       SELECT 1
         FROM reservations r
        WHERE r.asset_id = a.id
          AND r.status IN ('active', 'needs_reassignment', 'released')
          AND r.period && daterange(p_from, p_until, '[]')
     )
   WHERE m.is_bookable
   GROUP BY m.id;
END
$$;

REVOKE ALL ON FUNCTION model_availability(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION model_availability(date, date) TO wms_staff, wms_partner;
