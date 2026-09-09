# Model Card: no learned model

Date: 2026-09-09

WeaveCheck uses deterministic explicit-state search, not machine learning. The word "model" refers to a user-authored concurrency abstraction.

The checker can establish reachability within a validated finite script and completed state bound. It cannot establish that the abstraction matches production code, hardware memory behavior, operating-system scheduling, or external services. Users should treat that mapping as a separate engineering argument.
