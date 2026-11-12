import { PageHeading, VisitCTA } from "../components/Shared";
import ServiceCatalogue from "../catalogue/ServiceCatalogue";

export default function Services() {
  return (
    <>
      <PageHeading title="Services & Treatments">
        Explore our beauty and henna services. Choose a service to view availability and book your appointment.
      </PageHeading>
      <section className="container service-details">
        <ServiceCatalogue />
      </section>
      <VisitCTA />
    </>
  );
}
