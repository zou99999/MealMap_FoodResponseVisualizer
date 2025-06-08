# convert_food_aggregated.py

import sys
import os
import pandas as pd

# The exact nutrient columns your app expects, in order:
STANDARD_NUTRIENTS = [
    "calorie",
    "total_carb",
    "dietary_fiber",
    "sugar",
    "protein",
    "total_fat"
]

def convert_food_log(participant_id):
    pid = participant_id.zfill(3)
    folder = f"data_p{int(pid)}"
    infile  = os.path.join(folder, f"Food_Log_{pid}.csv")
    outfile = os.path.join(folder, f"Food_Meal_Aggregated.csv")

    if not os.path.exists(infile):
        print(f"❌ Input file not found: {infile}")
        sys.exit(1)

    # 1) Read CSV without header row
    df = pd.read_csv(infile, header=None)

    # 2) Assign the first 7 columns
    #    0: date, 1: time, 2: datetime, 3: food_name, 4: amount, 5: unit, 6: extra/desc
    df.columns = [
        "date",
        "time_begin",
        "datetime",
        "food_name",
        "amount",
        "unit",
        "_extra"
    ] + [f"raw_nut_{i}" for i in range(7, df.shape[1])]

    # 3) Parse the datetime column
    df["datetime"] = pd.to_datetime(df["datetime"])

    # 4) Build the descriptive 'logged_food' field
    df["logged_food"] = (
        df["amount"].fillna("").astype(str).str.strip() + " " +
        df["unit"].fillna("").astype(str).str.strip() + " " +
        df["food_name"].astype(str)
    ).str.replace(r"\s+", " ", regex=True).str.strip()

    # 5) Determine how many numeric columns we actually have
    raw_nuts = [c for c in df.columns if c.startswith("raw_nut_")]
    n_raw = len(raw_nuts)
    n_std = len(STANDARD_NUTRIENTS)

    # 6) Map the raw_nut_* columns to the standard names in order
    #    If fewer raw columns than STANDARD_NUTRIENTS, we'll pad with zeros later
    mapping = {
        raw_nuts[i]: STANDARD_NUTRIENTS[i]
        for i in range(min(n_raw, n_std))
    }

    # 7) Rename those columns in the DataFrame
    df = df.rename(columns=mapping)

    # 8) For any missing STANDARD_NUTRIENTS beyond what's in mapping, add them as zeros
    for nut in STANDARD_NUTRIENTS:
        if nut not in df.columns:
            df[nut] = 0.0

    # 9) Now group by datetime, aggregating:
    #    - logged_food: join with ", "
    #    - each nutrient: sum
    agg_dict = {nut: "sum" for nut in STANDARD_NUTRIENTS}
    agg_dict["logged_food"] = lambda texts: ", ".join(texts)

    grouped = (
        df[["datetime", "logged_food"] + STANDARD_NUTRIENTS]
        .groupby("datetime", as_index=False)
        .agg(agg_dict)
    )

    # 10) Reorder columns exactly as desired
    out_cols = ["datetime", "logged_food"] + STANDARD_NUTRIENTS
    grouped = grouped[out_cols]

    # 11) Write to CSV
    grouped.to_csv(outfile, index=False)
    print(f"✅ Wrote: {outfile}")
    print(grouped.head().to_string(index=False))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python convert_food_aggregated.py <participant_id>")
        print("Example: python convert_food_aggregated.py 003")
        sys.exit(1)
    participant = sys.argv[1]
    convert_food_log(participant)

