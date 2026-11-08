// DEVELOPMENT ONLY. Node 22.13+ built-in SQLite. Do not deploy this mock store to AWS.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { ElectionError, recount, validateBallot, validateManifest, DEPARTMENTS } from '../core/election.mjs';

export class LocalElectionStore {
  constructor({ databasePath = ':memory:', manifest, voters }) {
    this.manifest = validateManifest(manifest);
    this.db = new DatabaseSync(databasePath);
    this.db.exec(`PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS voter_status (voter_id TEXT PRIMARY KEY, department TEXT NOT NULL, has_voted INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS ballots (ballot_id TEXT PRIMARY KEY, election_id TEXT NOT NULL, department TEXT NOT NULL, selections TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    const savedElection = this.db.prepare('SELECT value FROM metadata WHERE key=?').get('election_id');
    if (savedElection && savedElection.value !== manifest.electionId) throw new ElectionError('Existing demo database has different election ID');
    if (!savedElection) {
      this.db.prepare('INSERT INTO metadata(key,value) VALUES(?,?)').run('election_id', manifest.electionId);
      const stmt = this.db.prepare('INSERT INTO voter_status(voter_id,department) VALUES(?,?)');
      for (const voter of voters) {
        if (!voter.id || !DEPARTMENTS.has(voter.department)) throw new ElectionError('Invalid demo voter');
        stmt.run(voter.id, voter.department);
      }
    }
  }

  getVoter(voterId) {
    const row = this.db.prepare('SELECT voter_id,department,has_voted FROM voter_status WHERE voter_id=?').get(voterId);
    if (!row) return null;
    return { id: row.voter_id, department: row.department, hasVoted: !!row.has_voted };
  }

  cast(voterId, selections) {
    if (this.manifest.status !== 'open') throw new ElectionError('Election is closed', 403, 'ELECTION_CLOSED');
    const voter = this.getVoter(voterId);
    if (!voter) throw new ElectionError('Unregistered voter', 403, 'NOT_ELIGIBLE');
    const normalized = validateBallot(this.manifest, voter.department, selections);
    const ballotId = randomUUID();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const updated = this.db.prepare('UPDATE voter_status SET has_voted=1 WHERE voter_id=? AND has_voted=0').run(voterId);
      if (updated.changes !== 1) throw new ElectionError('Ballot already submitted', 409, 'ALREADY_VOTED');
      this.db.prepare('INSERT INTO ballots(ballot_id,election_id,department,selections) VALUES(?,?,?,?)')
        .run(ballotId, this.manifest.electionId, voter.department, JSON.stringify(normalized));
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    // Random receipt identifies an accepted demo submission, not a proof of choices.
    return { accepted: true, receiptId: ballotId };
  }

  demoResults() {
    const rows = this.db.prepare('SELECT ballot_id,election_id,department,selections FROM ballots').all();
    return recount(this.manifest, rows.map(r => ({ ballotId: r.ballot_id, electionId: r.election_id, department: r.department, selections: JSON.parse(r.selections) })));
  }

  close() { this.db.close(); }
}
