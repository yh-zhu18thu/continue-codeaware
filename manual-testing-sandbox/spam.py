import pandas as pd

# Step 1: Load a table containing spam and non-spam labels
# Ensure the table is successfully loaded using pandas. The table should include a column that labels each email as spam or not.
data = pd.read_csv('emails.csv')  # Reads in the table from the given file path
print(data.head())  # Display the first few rows of the data