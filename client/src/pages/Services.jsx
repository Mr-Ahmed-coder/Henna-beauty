import { PageHeading, VisitCTA } from "../components/Shared";
import ServiceCatalogue from "../catalogue/ServiceCatalogue";
export default function Services() {
  return (
    <>
      <PageHeading
        title="Services & Prices"
      >
        Choose a service to see available appointment times.
      </PageHeading>
      <section className="container service-details">
        <ServiceCatalogue />
      </section>
      <VisitCTA />
    </>
  );
}
