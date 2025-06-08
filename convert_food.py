# aggregate_meals.py
import pandas as pd
import os
import sys

# 1. Read the participant ID from command-line arguments
if len(sys.argv) != 2:
    print("Usage: python aggregate_meals.py <participant_id>")
    sys.exit(1)
participant = sys.argv[1].strip().zfill(3)

# 2. Build input/output file paths
folder = f"data_p{int(participant)}"
input_path  = os.path.join(folder, f"Food_Log_{participant}.csv")
output_path = os.path.join(folder, "Food_Meal_Aggregated.csv")

# 3. Verify input exists
if not os.path.exists(input_path):
    raise FileNotFoundError(f"Cannot find: {input_path}")

# 4. Load the raw food log
#    Assumes columns include: "time_begin", "amount", "unit", "logged_food",
#    and nutrient columns named exactly: calorie, total_carb, dietary_fiber, sugar, protein, total_fat
df_food = pd.read_csv(input_path)

# 5. Parse the datetime column
#    "time_begin" is already in ISO format in the CSV
df_food['datetime'] = pd.to_datetime(df_food['time_begin'])

# 6. Build a descriptive 'food_description' = "amount + unit + logged_food"
def format_description(row):
    amt = "" if pd.isna(row['amount']) else f"{row['amount']}"
    unit = ""
    if isinstance(row['unit'], str) and row['unit'].strip():
        unit = f" {row['unit']}"
    return f"{amt}{unit} {row['logged_food']}".strip()

df_food['food_description'] = df_food.apply(format_description, axis=1)

# 7. Aggregate by 'datetime':
#    - Concatenate all 'food_description' values with ", "
#    - Sum each nutrient column
aggregated = df_food.groupby('datetime').agg({
    'food_description': lambda texts: ', '.join(texts),
    'calorie':        'sum',
    'total_carb':     'sum',
    'dietary_fiber':  'sum',
    'sugar':          'sum',
    'protein':        'sum',
    'total_fat':      'sum'
}).reset_index()

# 8. Rename for JS compatibility
aggregated.rename(columns={'food_description': 'logged_food'}, inplace=True)

# 9. Save to CSV
aggregated.to_csv(output_path, index=False)

print(f"✅ Written aggregated file to: {output_path}")
print("First few rows of the aggregated data:")
print(aggregated.head(10).to_string(index=False))
