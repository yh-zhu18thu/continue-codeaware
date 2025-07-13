
import pandas as pd
df = pd.read_csv("src/spam.csv", encoding="utf-8")
df = df.dropna().reset_index(drop=True)
from sklearn.model_selection import train_test_split