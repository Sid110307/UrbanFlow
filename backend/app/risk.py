from app import gemini_client


def classify_risk(classification, blockage_probability):
    if classification == "confirmed_blockage" or blockage_probability >= 85:
        return "red"
    if classification == "probable_blockage" or blockage_probability >= 40:
        return "yellow"
    return "green"


def build_dispatch_text(drain_name, debris_class, confidence, risk_level):
    return gemini_client.compose_dispatch_text(drain_name, debris_class, confidence, risk_level)


def build_citizen_alert(drain_name, risk_level):
    return gemini_client.compose_citizen_alert(drain_name, risk_level)
