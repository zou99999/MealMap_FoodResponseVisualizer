# aggregate_meals.py
import pandas as pd
import os

# 1. Paths (adjust if your structure is different)
input_path  = 'data_p1/Food_Log_001.csv'
output_path = 'data_p1/Food_Meal_Aggregated.csv'

# 2. Check that the input file exists
if not os.path.exists(input_path):
    raise FileNotFoundError(f"Cannot find: {input_path}")

# 3. Load your raw food-log
df_food = pd.read_csv(input_path)

# 4. PARSE datetime: 
#    time_begin already looks like "2020-02-13 18:00:00" in the CSV,
#    so we can parse it directly—no need to prepend the 'date' column.
df_food['datetime'] = pd.to_datetime(df_food['time_begin'])

# 5. Build a “food_description” = “amount + unit + food_name”
def format_description(row):
    amt = "" if pd.isna(row['amount']) else f"{row['amount']}"
    unit = ""
    if isinstance(row['unit'], str) and row['unit'].strip():
        unit = f" {row['unit']}"
    # If both amt and unit are empty, this reduces to just the food name.
    return f"{amt}{unit} {row['logged_food']}".strip()

df_food['food_description'] = df_food.apply(format_description, axis=1)

# 6. Group by exact datetime and sum the nutrition, while joining all food_descriptions
aggregated = df_food.groupby('datetime').agg({
    'food_description': lambda x: ', '.join(x),
    'calorie':       'sum',
    'total_carb':    'sum',
    'dietary_fiber': 'sum',
    'sugar':         'sum',
    'protein':       'sum',
    'total_fat':     'sum'
}).reset_index()

# 7. Rename the column back to “logged_food” so it matches your JS expectations
aggregated.rename(columns={'food_description': 'logged_food'}, inplace=True)

# 8. Save to a new CSV
aggregated.to_csv(output_path, index=False)

print(f"✅  Written aggregated file to:\n    {output_path}\n")
print("Here are the first few rows:")
print(aggregated.head(10).to_string(index=False))
