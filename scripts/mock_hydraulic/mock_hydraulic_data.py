import time
import random

def generate_mock_hydraulic_data():
    return {
        "timestamp": time.time(),
        "assembly": {
            "bearing": random.choice([True, False]),
            "shaft": random.choice([True, False]),
        },
        "position": {
            "displacement_mm": round(random.uniform(0, 50), 2),
        },
        "vice": {
            "open": random.choice([True, False]),
            "close": random.choice([True, False]),
        },
        "safety": {
            "buzzer": random.choice([True, False]),
            "curtain": random.choice([True, False]),
            "lights": {
                "red": random.choice([True, False]),
                "orange": random.choice([True, False]),
                "green": random.choice([True, False]),
            }
        }
    }
