import { render, fireEvent } from "@testing-library/react-native";
import { EventCard } from "../EventCard";
import type { EventCard as EventCardT } from "@biocatalyst/types";

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

const event: EventCardT = {
  id: "e1",
  headline: "DCGI approves Demo Pharma's phase 3 trial",
  occurredAt: "2026-09-29T10:00:00.000Z",
  eventType: "regulatory_approval",
  company: { id: "c1", slug: "demo-pharma", name: "Demo Pharma", ticker: "DEMOPHARMA", exchange: "NSE" },
  drug: { name: "Demomab" },
  indication: "Type 2 diabetes",
  fact: "DCGI granted approval on 29 Sep 2026.",
  summary: "The regulator approved the trial. Enrollment begins next quarter.",
  catalystSummary: "Removes a key regulatory overhang.",
  sources: [{ title: "Source", url: "https://example.com", isPrimary: true }],
  confidence: 0.92,
  marketReaction: {
    windowDefinition: "Close before vs close after announcement",
    windowStart: "2026-09-28T10:00:00.000Z",
    windowEnd: "2026-09-29T10:00:00.000Z",
    securityTicker: "DEMOPHARMA",
    exchange: "NSE",
    priceBefore: 100,
    priceAfter: 102.4,
    pctChange: 2.4,
    provider: "fixture",
  },
};

describe("EventCard", () => {
  it("renders the headline, company/ticker, fact and source count", () => {
    const { getByText } = render(<EventCard event={event} onPress={() => {}} />);
    expect(getByText("DCGI approves Demo Pharma's phase 3 trial")).toBeTruthy();
    expect(getByText("DEMOPHARMA")).toBeTruthy();
    expect(getByText("Demo Pharma · Demomab · Type 2 diabetes")).toBeTruthy();
    expect(getByText("DCGI granted approval on 29 Sep 2026.")).toBeTruthy();
    expect(getByText("1 source · primary")).toBeTruthy();
    expect(getByText("Regulatory approval")).toBeTruthy();
  });

  it("shows the market reaction as a signed percent", () => {
    const { getByText } = render(<EventCard event={event} onPress={() => {}} />);
    expect(getByText("+2.4%")).toBeTruthy();
  });

  it("calls onPress when tapped", () => {
    const onPress = jest.fn();
    const { getByText } = render(<EventCard event={event} onPress={onPress} />);
    fireEvent.press(getByText("DCGI approves Demo Pharma's phase 3 trial"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("renders without optional fields", () => {
    const minimal: EventCardT = {
      ...event,
      company: undefined,
      drug: undefined,
      indication: undefined,
      marketReaction: undefined,
    };
    const { getByText, queryByText } = render(<EventCard event={minimal} onPress={() => {}} />);
    expect(getByText("DCGI approves Demo Pharma's phase 3 trial")).toBeTruthy();
    expect(queryByText("+2.4%")).toBeNull();
  });
});
