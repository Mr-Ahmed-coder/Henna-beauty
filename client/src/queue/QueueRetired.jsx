import { Link } from "react-router-dom";
import { PageHeading } from "../components/Shared";

export default function QueueRetired() {
  return (
    <>
      <PageHeading title="Book your salon visit">
        Online queue entry and ticket tracking have closed. Reserve an appointment instead.
      </PageHeading>
      <section className="booking-container container">
        <p>If you already have a queue ticket, contact reception before making another booking. Staff can help with your existing visit.</p>
        <div className="actions">
          <Link className="button" to="/appointments">Book Appointment</Link>
          <Link className="text-link" to="/contact">Contact reception</Link>
        </div>
      </section>
    </>
  );
}
