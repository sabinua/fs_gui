package store

import "testing"

func hangupFields(uuid, dir, from, to, cause string, start, answer, end int64) map[string]string {
	f := map[string]string{
		"Event-Name":                "CHANNEL_HANGUP_COMPLETE",
		"Unique-ID":                 uuid,
		"Call-Direction":            dir,
		"Caller-Caller-ID-Name":     from,
		"Caller-Caller-ID-Number":   from,
		"Caller-Destination-Number": to,
		"Hangup-Cause":              cause,
	}
	if start > 0 {
		f["variable_start_epoch"] = itoa(start)
		f["variable_end_epoch"] = itoa(end)
		f["variable_duration"] = itoa(end - start)
	}
	if answer > 0 {
		f["variable_answer_epoch"] = itoa(answer)
		f["variable_billsec"] = itoa(end - answer)
	}
	return f
}

func itoa(n int64) string {
	return string(rune('0'+n%10)) // only for single digits in tests
}

func TestCDRInsertAndQuery(t *testing.T) {
	s, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	if err := s.InsertCDR("conn1", hangupFields("u1", "inbound", "1001", "2001", "NORMAL_CLEARING", 1, 2, 9)); err != nil {
		t.Fatal(err)
	}
	if err := s.InsertCDR("conn1", hangupFields("u2", "outbound", "1002", "3001", "NO_ANSWER", 2, 0, 8)); err != nil {
		t.Fatal(err)
	}
	if err := s.InsertCDR("conn2", hangupFields("u3", "inbound", "1001", "2001", "NORMAL_CLEARING", 3, 4, 9)); err != nil {
		t.Fatal(err)
	}

	// Sharding by connection.
	page, err := s.QueryCDR("conn1", CDRFilter{})
	if err != nil || page.Total != 2 {
		t.Fatalf("conn1 total: %d, %v", page.Total, err)
	}

	// Newest first.
	if page.Rows[0].UUID != "u2" || page.Rows[1].UUID != "u1" {
		t.Fatalf("order: %+v", page.Rows)
	}
	if page.Rows[1].Billsec != 7 || page.Rows[1].Duration != 8 {
		t.Fatalf("durations: %+v", page.Rows[1])
	}

	// Number filter matches caller or destination.
	page, _ = s.QueryCDR("conn1", CDRFilter{Number: "3001"})
	if page.Total != 1 || page.Rows[0].UUID != "u2" {
		t.Fatalf("number filter: %+v", page)
	}

	// Direction + cause.
	page, _ = s.QueryCDR("conn1", CDRFilter{Direction: "inbound"})
	if page.Total != 1 {
		t.Fatalf("direction filter: %+v", page)
	}
	page, _ = s.QueryCDR("conn1", CDRFilter{Cause: "NO_ANSWER"})
	if page.Total != 1 || page.Rows[0].AnswerEpoch != 0 {
		t.Fatalf("cause filter: %+v", page)
	}

	// Time range.
	page, _ = s.QueryCDR("conn1", CDRFilter{FromEpoch: 2})
	if page.Total != 1 || page.Rows[0].UUID != "u2" {
		t.Fatalf("from filter: %+v", page)
	}

	// Raw payload survives round-trip.
	raw, err := s.GetCDRRaw(page.Rows[0].ID)
	if err != nil || raw == "" || raw == "{}" {
		t.Fatalf("raw: %q, %v", raw, err)
	}

	// Streaming export sees the same rows.
	n := 0
	if err := s.EachCDR("conn1", CDRFilter{}, func(CDRRow) error { n++; return nil }); err != nil || n != 2 {
		t.Fatalf("each: %d, %v", n, err)
	}
}
