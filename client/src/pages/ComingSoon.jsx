import { Link } from "react-router-dom";
import { CalendarDays, ListOrdered, ArrowLeft } from "lucide-react";
export default function ComingSoon({ queue = false }) {
  const Icon = queue ? ListOrdered : CalendarDays;
  return (
    <section className="coming-soon container">
      <Icon size={42} strokeWidth={1} />
      <p className="eyebrow">COMING IN A FUTURE PHASE</p>
      <h1>
        {queue ? "A calmer way to wait." : "Your moment, on the calendar."}
      </h1>
      <p>
        {queue
          ? "The walk-in queue is not available yet. You cannot join a queue or view live wait times on this preview."
          : "Online appointments are not available yet. This preview cannot reserve a time or send a booking request."}
      </p>
      <div className="notice">
        {queue
          ? "No queue entry has been created."
          : "No appointment has been booked."}
      </div>
      <Link className="button" to="/services">
        <ArrowLeft size={17} /> Explore services
      </Link>
      <Link className="text-link" to="/contact">
        View contact information
      </Link>
    </section>
  );
}
