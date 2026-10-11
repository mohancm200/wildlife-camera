
import sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from PytorchWildlife.models import detection


def main():
    image_path = Path("test_images") / "wildlife.jpg"

    if not image_path.is_file():
        print(f"ERROR: Image not found: {image_path.resolve()}")
        print("Place an animal photo at test_images/wildlife.jpg")
        sys.exit(1)

    device = "cuda" if torch.cuda.is_available() else "cpu"

    print("Loading MegaDetector...")
    model = detection.MegaDetectorV5(device=device)
    print("MegaDetector initialized successfully.")

    print(f"Reading image: {image_path}")
    image = np.array(Image.open(image_path).convert("RGB"))

    print("Running wildlife detection...")

    results = model.single_image_detection(
        image,
        img_path=str(image_path),
        det_conf_thres=0.2,
    )

    print("\n" + "=" * 45)
    print("WILDSENSE WILDLIFE DETECTION RESULTS")
    print("=" * 45)
    print("Image:", image_path.name)
    print("Device:", device)
    print("Detection completed successfully.")
    print("\nResults:")
    print(results)

    if isinstance(results, dict):
        detections = results.get("detections", [])
        print(f"\nNumber of detections: {len(detections)}")


if __name__ == "__main__":
    main()
