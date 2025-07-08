# write a spam classification file:
import pandas as pd

def classify_spam(df):
    # Load the dataset
    df = pd.read_csv('src/spam.csv')
    # Split the data into features and target variable
    X = df['text']
    y = df['label']
    # Train a SVM classifier














