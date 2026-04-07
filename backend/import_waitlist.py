#!/usr/bin/env python3
"""
Import waitlist emails from a CSV file.

Usage:
    python import_waitlist.py waitlist.csv

CSV format: Should have an 'email' column (case-insensitive header matching)
Skips emails that already exist in users table or waitlist table.
"""
import sys
import csv
from app.database import SessionLocal
from app.models import User, Waitlist


def import_waitlist(csv_path: str):
    db = SessionLocal()
    try:
        # Get existing emails from both tables
        existing_users = {u.email.lower() for u in db.query(User.email).all()}
        existing_waitlist = {w.email.lower() for w in db.query(Waitlist.email).all()}

        added = 0
        skipped = 0

        with open(csv_path, 'r') as f:
            reader = csv.DictReader(f)

            # Find email column (case-insensitive)
            email_col = None
            for col in reader.fieldnames:
                if col.lower() == 'email':
                    email_col = col
                    break

            if not email_col:
                print(f"Error: No 'email' column found in CSV. Found columns: {reader.fieldnames}")
                return

            for row in reader:
                email = row[email_col].strip().lower()

                if not email:
                    continue

                # Skip if already registered or in waitlist
                if email in existing_users:
                    print(f"Skipped (already registered): {email}")
                    skipped += 1
                    continue

                if email in existing_waitlist:
                    print(f"Skipped (already in waitlist): {email}")
                    skipped += 1
                    continue

                # Add to waitlist
                waitlist_entry = Waitlist(email=email)
                db.add(waitlist_entry)
                existing_waitlist.add(email)
                print(f"Added: {email}")
                added += 1

        db.commit()
        print(f"\nDone! Added {added}, skipped {skipped}")

    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python import_waitlist.py waitlist.csv")
        sys.exit(1)

    import_waitlist(sys.argv[1])
