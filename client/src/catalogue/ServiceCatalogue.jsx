import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Clock3 } from "lucide-react";
import { bookingApi, serviceUnavailableReason } from "../booking/api";

export default function ServiceCatalogue({ limit }) {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    bookingApi("/api/booking/catalog", { signal: controller.signal })
      .then(setCatalog)
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message);
      });
    return () => controller.abort();
  }, []);

  if (error)
    return (
      <div className="catalogue-empty" role="alert">
        The live service catalogue is unavailable right now. {error}
      </div>
    );

  if (!catalog)
    return <p className="catalogue-loading">Loading salon services…</p>;

  const services = limit ? catalog.services.slice(0, limit) : catalog.services;

  if (!services.length)
    return (
      <div className="catalogue-empty">
        No active services have been published yet. Please check back soon.
      </div>
    );

  return (
    <div className="catalogue-grid">
      {services.map((service) => (
        <article className="catalogue-card" key={service._id}>
          {service.imageUrl ? (
            <img src={service.imageUrl} alt="" loading="lazy" decoding="async" width="720" height="480" />
          ) : (
            <div className="catalogue-image-placeholder" aria-hidden="true">
              ✳
            </div>
          )}
          <div className="catalogue-card-body">
            <p className="eyebrow">{service.category || "General"}</p>
            <h3>{service.name}</h3>
            {service.description && <p>{service.description}</p>}
            <div className="catalogue-meta">
              <span className="price-tag">Price available in salon</span>
              <span>
                <Clock3 size={15} /> {service.durationMinutes} min
              </span>
            </div>
            {service.bookable ? (
              <Link className="text-link" to={`/appointments?service=${service._id}`}>
                Book Appointment <ArrowUpRight size={16} />
              </Link>
            ) : (
              <p className="catalogue-unavailable">
                {serviceUnavailableReason(service)}. Online booking is unavailable for this service.
              </p>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
