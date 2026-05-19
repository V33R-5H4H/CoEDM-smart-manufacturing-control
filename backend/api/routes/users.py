#to be implemented later

# from fastapi import APIRouter, Depends, HTTPException
# from sqlalchemy.orm import Session
# from .. import crud, models, schemas
# from ..database import SessionLocal

# router = APIRouter(
#     prefix="/users", tags=["users"]
# )



# def get_db():
#     db = SessionLocal()
#     try:
#         yield db
#     finally:
#         db.close()

# @router.post("/", response_model=schemas.UserResponse)
# def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
#     return crud.create_user(db, user)

# @router.get("/", response_model=list[schemas.UserResponse])
# def read_users(db: Session = Depends(get_db)):
#     return crud.get_all_users(db)

# @router.delete("/{user_id}", response_model=schemas.UserDeleteResponse)
# def delete_user(user_id: int, db: Session = Depends(get_db)):
#     return crud.delete_user(db, user_id)

