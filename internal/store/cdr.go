package store

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

// CDRRow is one completed call, extracted from CHANNEL_HANGUP_COMPLETE.
type CDRRow struct {
	ID          int64  `json:"id"`
	UUID        string `json:"uuid"`
	Direction   string `json:"direction"`
	CidName     string `json:"cidName"`
	CidNum      string `json:"cidNum"`
	Dest        string `json:"dest"`
	StartEpoch  int64  `json:"startEpoch"`
	AnswerEpoch int64  `json:"answerEpoch"`
	EndEpoch    int64  `json:"endEpoch"`
	Duration    int64  `json:"duration"`
	Billsec     int64  `json:"billsec"`
	HangupCause string `json:"hangupCause"`
}

// CDRFilter narrows QueryCDR results. Zero values mean "no constraint".
type CDRFilter struct {
	Number    string `json:"number"`    // substring of cid_num OR dest
	Direction string `json:"direction"` // inbound | outbound
	Cause     string `json:"cause"`     // exact hangup cause
	FromEpoch int64  `json:"fromEpoch"`
	ToEpoch   int64  `json:"toEpoch"`
	Limit     int    `json:"limit"`
	Offset    int    `json:"offset"`
}

type CDRPage struct {
	Rows  []CDRRow `json:"rows"`
	Total int      `json:"total"`
}

func epochOf(fields map[string]string, keys ...string) int64 {
	for _, k := range keys {
		if v := fields[k]; v != "" {
			if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
				return n
			}
		}
	}
	return 0
}

// InsertCDR stores a completed call from its hangup event fields.
func (s *Store) InsertCDR(connID string, fields map[string]string) error {
	raw, err := json.Marshal(fields)
	if err != nil {
		raw = []byte("{}")
	}
	_, err = s.db.Exec(`
INSERT INTO cdr (conn_id, uuid, direction, cid_name, cid_num, dest, start_epoch, answer_epoch, end_epoch, duration, billsec, hangup_cause, raw)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		connID,
		fields["Unique-ID"],
		fields["Call-Direction"],
		fields["Caller-Caller-ID-Name"],
		fields["Caller-Caller-ID-Number"],
		fields["Caller-Destination-Number"],
		epochOf(fields, "variable_start_epoch", "variable_created_time"),
		epochOf(fields, "variable_answer_epoch"),
		epochOf(fields, "variable_end_epoch"),
		epochOf(fields, "variable_duration"),
		epochOf(fields, "variable_billsec"),
		fields["Hangup-Cause"],
		string(raw))
	return err
}

func (f CDRFilter) where(connID string) (string, []any) {
	cond := []string{"conn_id = ?"}
	args := []any{connID}
	if f.Number != "" {
		cond = append(cond, "(cid_num LIKE ? OR dest LIKE ?)")
		pat := "%" + f.Number + "%"
		args = append(args, pat, pat)
	}
	if f.Direction != "" {
		cond = append(cond, "direction = ?")
		args = append(args, f.Direction)
	}
	if f.Cause != "" {
		cond = append(cond, "hangup_cause = ?")
		args = append(args, f.Cause)
	}
	if f.FromEpoch > 0 {
		cond = append(cond, "start_epoch >= ?")
		args = append(args, f.FromEpoch)
	}
	if f.ToEpoch > 0 {
		cond = append(cond, "start_epoch <= ?")
		args = append(args, f.ToEpoch)
	}
	return strings.Join(cond, " AND "), args
}

func (s *Store) QueryCDR(connID string, f CDRFilter) (CDRPage, error) {
	where, args := f.where(connID)

	page := CDRPage{Rows: []CDRRow{}}
	if err := s.db.QueryRow("SELECT COUNT(*) FROM cdr WHERE "+where, args...).Scan(&page.Total); err != nil {
		return page, err
	}

	limit := f.Limit
	if limit <= 0 || limit > 1000 {
		limit = 50
	}
	q := fmt.Sprintf(`
SELECT id, uuid, direction, cid_name, cid_num, dest, start_epoch, answer_epoch, end_epoch, duration, billsec, hangup_cause
FROM cdr WHERE %s ORDER BY start_epoch DESC, id DESC LIMIT %d OFFSET %d`, where, limit, f.Offset)
	rows, err := s.db.Query(q, args...)
	if err != nil {
		return page, err
	}
	defer rows.Close()
	for rows.Next() {
		var r CDRRow
		if err := rows.Scan(&r.ID, &r.UUID, &r.Direction, &r.CidName, &r.CidNum, &r.Dest,
			&r.StartEpoch, &r.AnswerEpoch, &r.EndEpoch, &r.Duration, &r.Billsec, &r.HangupCause); err != nil {
			return page, err
		}
		page.Rows = append(page.Rows, r)
	}
	return page, rows.Err()
}

// GetCDRRaw returns the full stored event fields of one CDR as JSON.
func (s *Store) GetCDRRaw(id int64) (string, error) {
	var raw string
	err := s.db.QueryRow(`SELECT raw FROM cdr WHERE id = ?`, id).Scan(&raw)
	return raw, err
}

// EachCDR streams every matching row (no pagination) for CSV export.
func (s *Store) EachCDR(connID string, f CDRFilter, fn func(CDRRow) error) error {
	where, args := f.where(connID)
	rows, err := s.db.Query(`
SELECT id, uuid, direction, cid_name, cid_num, dest, start_epoch, answer_epoch, end_epoch, duration, billsec, hangup_cause
FROM cdr WHERE `+where+` ORDER BY start_epoch DESC, id DESC`, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var r CDRRow
		if err := rows.Scan(&r.ID, &r.UUID, &r.Direction, &r.CidName, &r.CidNum, &r.Dest,
			&r.StartEpoch, &r.AnswerEpoch, &r.EndEpoch, &r.Duration, &r.Billsec, &r.HangupCause); err != nil {
			return err
		}
		if err := fn(r); err != nil {
			return err
		}
	}
	return rows.Err()
}
